# ✈️ AeroSentry

![Language](https://img.shields.io/badge/Node.js-22.x-green.svg) ![Framework](https://img.shields.io/badge/Framework-Express.js-lightgrey.svg) ![License](https://img.shields.io/badge/License-MIT-blue.svg)

**AeroSentry is a two-system, trusted weather intelligence platform designed to enhance aviation safety by providing pilots and ground control with real-time, dynamic, and predictive weather analysis.**

It acts as a digital co-pilot, transforming raw, complex aviation weather data into an interactive 3D visualization with actionable insights, including automatic hazard detection and route adjustments.

---

## Core Features

AeroSentry is built as a two-part system, ensuring that both the flight crew and ground control have access to synchronized, role-specific intelligence.

### 👨‍✈️ Pilot’s System (Frontend)

* **Interactive 3D Globe:** A fully interactive globe that visualizes dynamic flight paths and weather conditions in a rich, intuitive interface.
* **Real-time Weather Integration:** Seamlessly integrates with the `aviationweather.gov` API to fetch and decode live METAR, TAF, and SIGMET reports.
* **Intelligent Checkpoint Analysis:** An advanced algorithm that evaluates weather conditions at multiple calculated checkpoints between the departure and destination airports, not just at the endpoints.
* **Dynamic Rerouting:** Automatically detects when a flight path intersects with high-risk thunderstorm zones (SIGMETs) and calculates a safer, alternative route.
* **Visual Weather Dashboard:** A clean, heads-up display of critical weather statistics that updates in real-time as flight conditions change.
* **AI-Powered Assistant:** An integrated chatbot providing pilots with instant, context-aware weather summaries, regulatory information, and safety suggestions.

### 🖥️ Admin’s System (Ground Control)

* **Secure Authentication:** A robust, JWT-based authentication system that provides distinct, permission-based access for pilots and administrators.
* **Comprehensive Monitoring Dashboard:** Access to deeper weather analytics and monitoring tools for a fleet-level overview.
* **Data Integrity:** Includes logic for weather spoofing detection to flag suspicious or manipulated data transmissions (future implementation).
* **Enhanced Intelligence Access:** Full, unfiltered access to all weather intelligence data to support critical decision-making from the ground.

---

## 🛠️ Technical Architecture & Stack

The backend of AeroSentry is built on a modern, high-performance Node.js stack chosen for its asynchronous nature and robust ecosystem.

### Core Framework: Express.js

The application uses **Express.js**, a minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications.

* **Asynchronous by Nature:** Node.js and Express excel at handling I/O-bound operations, such as making multiple simultaneous network calls to fetch METARs, TAFs, and SIGMETs. Using `Promise.all`, we can fire off all data requests concurrently, dramatically reducing response times.
* **Middleware Architecture:** Express uses a powerful middleware system, which is perfect for creating reusable logic for authentication, logging, and error handling. Our `verifyTokenMiddleware` is a prime example, protecting routes by checking for a valid JWT before any other logic runs.

### Supporting Libraries (The Toolbox 🧰)

* **`axios`**: A promise-based HTTP client for making requests to the external aviation weather APIs.
* **`jsonwebtoken` (jwt)**: Used to create and verify the secure JSON Web Tokens for our authentication system.
* **`bcryptjs`**: A library to hash passwords for secure storage and comparison (recommended over plain text).
* **`csv-parser`**: A streaming CSV parser used for high-performance, in-memory loading of the `airports.csv` database at startup.
* **`geographiclib-geodesic` & `@turf/turf`**: A powerful duo for geospatial analysis:
    * `geographiclib-geodesic` calculates the true geodesic path (shortest line on Earth's surface) for accurate route plotting.
    * `@turf/turf` provides the computational geometry engine to represent flight paths and hazardous weather zones as GeoJSON objects, enabling the core intersection logic for rerouting.

---

## ⚙️ How It Works

The application logic follows a secure and efficient flow from user authentication to final data delivery.

1.  **Authentication (`/login`):**
    * A user (pilot or admin) submits their credentials.
    * The server validates them against the user database.
    * If successful, the server generates and returns a secure **JWT (JSON Web Token)**.

2.  **Mission Briefing (`/mission-briefing/:departure/:destination`):**
    * The pilot makes a request, including the JWT in the `Authorization` header.
    * The **`verifyTokenMiddleware` guard** intercepts the request to verify the JWT's validity and the user's role before allowing the request to proceed.
    * **Concurrent Data Fetching:** The server uses `Promise.all` to fire off `axios` requests for all necessary data (coordinates, METAR, TAF, SIGMETs) at once.
    * **Analysis & Rerouting:**
        * The route is calculated and broken down into segments using `geographiclib`.
        * SIGMETs are parsed into GeoJSON `Polygon` objects using Turf.js.
        * The code iterates through each flight segment, checking if it **intersects** with a SIGMET polygon using `turf.booleanIntersects`.
        * If a hazard is detected, the `findSigmetReroute` function calculates a detour by creating a new waypoint.
    * **Response Assembly:** All processed data—departure/destination weather, the final (potentially rerouted) flight path, and overall risk—is compiled into a single JSON response for the frontend.

---

## 🚀 Getting Started

Follow these instructions to get the AeroSentry backend up and running on your local machine.

### Prerequisites

* Node.js (v16 or higher recommended)
* npm (usually comes with Node.js)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/aerosentry.git
    cd aerosentry
    ```

2.  **Create a `.env` file** in the root of the project and add your secret key:
    ```env
    PORT=8000
    SECRET_KEY="your_super_secret_jwt_key_that_is_long_and_secure"
    ```

3.  **Install the required dependencies:**
    ```bash
    npm install
    ```

4.  **Download the Airport Database:**
    * Download the `airports.csv` file from [OurAirports.com](https://davidmegginson.github.io/ourairports-data/airports.csv).
    * Place it in the root directory of the project.

5.  **Run the application:**
    ```bash
    node server.js
    ```
    The API will now be running at `http://localhost:8000`.

---

## 📖 API Endpoints

The API provides the following core endpoints:

| Method | Endpoint                                    | Description                                                         | Access      |
| :----- | :------------------------------------------ | :------------------------------------------------------------------ | :---------- |
| `POST` | `/login`                                    | Authenticates a user and returns a JWT access token.                | Public      |
| `GET`  | `/mission-briefing/:departure/:destination` | Provides a full weather briefing for a route. Requires a valid JWT. | Pilot/Admin |
| `GET`  | `/admin/analytics`                          | (Example) An endpoint for fetching administrative data.             | Admin       |

---

## 🤝 Contributing

Contributions are welcome! If you'd like to improve AeroSentry, please feel free to fork the repository and submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

---

## 🙏 Acknowledgements

* **Weather Data:** [aviationweather.gov](https://aviationweather.gov/)
* **Airport Data:** [OurAirports.com](https://ourairports.com/)
* **Framework:** [Express.js](https://expressjs.com/)
* **3D Globe:** [Globe.gl](https://github.com/vasturiano/globe.gl)
