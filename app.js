// =====================================================
// BEEBOT CONNECT - FIREBASE INTEGRATION
// =====================================================

import { initializeApp } from
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged
} from
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    getDatabase,
    ref,
    onValue
} from
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";


// =====================================================
// 1. FIREBASE CONFIGURATION
// Replace the placeholders with your existing web config.
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyDs7khk71F8cdX41c7ojqZWg_2UizzppCI",
    authDomain: "beebot-connect.firebaseapp.com",
    databaseURL: "https://beebot-connect-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "beebot-connect",
    appId: "1:625149323582:web:eef466502458023083a46f"
};


// =====================================================
// 2. INITIALIZE FIREBASE
// =====================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const database = getDatabase(app);


// =====================================================
// 3. HTML ELEMENTS
// =====================================================

const loginForm = document.getElementById("firebaseLoginForm");
const emailInput = document.getElementById("firebaseEmail");
const passwordInput = document.getElementById("firebasePassword");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("firebaseLoginButton");
const loginSection = document.getElementById("firebaseLogin");

const connectButton = document.getElementById("connectButton");


// =====================================================
// 4. HELPER FUNCTIONS
// =====================================================

function updateText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


function formatNumber(value, decimals = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toFixed(decimals);
}


function updateConnectionStatus(connected, message = "") {

    const badge = document.getElementById("connectionBadge");

    if (badge) {
        badge.textContent = connected
            ? "CONNECTED"
            : "DISCONNECTED";

        badge.style.background = connected
            ? "#e9f4df"
            : "#fff0ed";

        badge.style.color = connected
            ? "#4d8038"
            : "#d66d65";
    }

    updateText(
        "connectionStatus",
        message || (connected
            ? "Connected to Firebase"
            : "Not connected")
    );

    updateText(
        "sidebarStatus",
        connected ? "BeeBot Online" : "BeeBot Offline"
    );
}


// =====================================================
// 5. UPDATE SENSOR READINGS
// =====================================================

function updateSensorReadings(data) {

    if (!data) {
        updateText("deviceStatus", "No sensor data");
        return;
    }

    // Temperature
    if (data.insideTemp !== undefined) {
        updateText(
            "insideTemp",
            formatNumber(data.insideTemp)
        );
    }

    if (data.outsideTemp !== undefined) {
        updateText(
            "outsideTemp",
            formatNumber(data.outsideTemp)
        );
    }

    // Humidity
    if (data.insideHumidity !== undefined) {
        updateText(
            "insideHumidity",
            formatNumber(data.insideHumidity)
        );
    }

    if (data.outsideHumidity !== undefined) {
        updateText(
            "outsideHumidity",
            formatNumber(data.outsideHumidity)
        );
    }

    // Hive weight
    if (data.weight !== undefined) {

        let weight = Number(data.weight);

        if (Number.isFinite(weight)) {
            if (weight < 0 && weight >= -0.05) {
                weight = 0;
            }

            updateText("weight", formatNumber(weight, 2));
        }
    }

    // Sound level
    if (data.soundDb !== undefined) {
        updateText(
            "soundDb",
            formatNumber(data.soundDb)
        );
    }

    if (data.soundState !== undefined) {
        updateText("soundState", data.soundState);
    }

    // Servo
    if (data.servoAngle !== undefined) {
        updateText("servoAngle", data.servoAngle);
    }

    if (data.servoOpen !== undefined) {
        updateText(
            "servoStatus",
            data.servoOpen ? "Ventilation Open" : "Ventilation Closed"
        );
    }

    // Dashboard information
    updateText("dataSource", "Firebase Realtime Database");
    updateText("deviceStatus", "Data received");
    updateText("lastUpdated", new Date().toLocaleTimeString());

    updateConnectionStatus(true, "Connected to Firebase");
}


// =====================================================
// 6. READ LIVE DATA FROM FIREBASE
// =====================================================

let stopSensorListener = null;

function startFirebaseListener() {

    // Remove any previous listener
    if (stopSensorListener) {
        stopSensorListener();
        stopSensorListener = null;
    }

    const sensorReference = ref(
        database,
        "/BeeBot/sensors/current"
    );

    stopSensorListener = onValue(
        sensorReference,

        (snapshot) => {

            if (snapshot.exists()) {

                const sensorData = snapshot.val();

                console.log("BeeBot sensor data:", sensorData);

                updateSensorReadings(sensorData);

            } else {

                updateConnectionStatus(
                    true,
                    "Firebase connected, but no sensor data found"
                );

                updateText("deviceStatus", "No sensor data");
            }
        },

        (error) => {

            console.error("Firebase read error:", error);

            updateConnectionStatus(
                false,
                "Unable to read Firebase data"
            );

            updateText("deviceStatus", "Read error");
        }
    );
}


// =====================================================
// 7. FIREBASE LOGIN
// =====================================================

if (loginForm) {

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            loginMessage.textContent =
                "Please enter your email and password.";
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Signing in...";

        loginMessage.textContent = "";

        try {

            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

            loginMessage.textContent = "Login successful!";

            passwordInput.value = "";

        } catch (error) {

            console.error("Firebase login error:", error);

            loginMessage.textContent =
                "Login failed: " + error.message;

        } finally {

            loginButton.disabled = false;
            loginButton.textContent = "Sign In";
        }

    });

}


// =====================================================
// 8. CHECK AUTHENTICATION STATUS
// =====================================================

onAuthStateChanged(auth, (user) => {

    if (user) {

        console.log("BeeBot viewer authenticated.");

        if (loginSection) {
            loginSection.style.display = "none";
        }

        updateConnectionStatus(
            true,
            "Signed in. Connecting to sensor data..."
        );

        updateText("deviceStatus", "Waiting for readings");

        startFirebaseListener();

    } else {

        console.log("No Firebase user signed in.");

        if (loginSection) {
            loginSection.style.display = "block";
        }

        if (stopSensorListener) {
            stopSensorListener();
            stopSensorListener = null;
        }

        updateConnectionStatus(
            false,
            "Please sign in to Firebase"
        );

        updateText("deviceStatus", "Offline");
        updateText("dataSource", "Waiting for login");

    }

});


// =====================================================
// 9. LOCAL ESP32 BUTTON
// Firebase is now the dashboard's data connection.
// =====================================================

if (connectButton) {

    connectButton.addEventListener("click", () => {

        if (auth.currentUser) {

            alert(
                "BeeBot is using Firebase now. " +
                "You do not need to enter the ESP32 IP address."
            );

        } else {

            alert("Please sign in to Firebase first.");

        }

    });

}


// =====================================================
// BEEBOT CONNECT INITIALIZED
// =====================================================

console.log("BeeBot Connect Firebase integration initialized.");