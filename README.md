# 💻 NexusOps Frontend Command Center
> Real-time DevOps & SRE monitoring dashboard built with React.js, Vite, and Tailwind CSS.

![React](https://img.shields.io/badge/React.js-Vite-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-cyan) ![SignalR](https://img.shields.io/badge/@microsoft/signalr-orange) ![Lucide Icons](https://img.shields.io/badge/Lucide-Icons-purple)

## 🌟 Overview
The user interface for **NexusOps Command Center**. It provides a live, glassmorphic command dashboard featuring real-time SignalR telemetry feeds, interactive AI root-cause analysis cards, executive SLA metrics, and Web Audio API alerts.

## 🛠️ Tech Stack
* **Core:** React.js (Vite, ES Modules)
* **Styling:** Tailwind CSS
* **Real-Time Client:** `@microsoft/signalr`
* **Icons & Audio:** Lucide React, Web Audio API (Cyber Siren synthesizer)

## ✨ Key Features
* **Live WebSocket Telemetry Stream:** Dynamic feed displaying real-time pings, status codes, and latencies without page reloads.
* **AI Incident Diagnostics Drawer:** One-click root-cause analysis and re-analysis powered by Gemini AI.
* **SLA & Uptime Analytics:** Automated calculation of system availability percentages and average latencies.
* **Audio Alerts & Report Export:** Built-in Web Audio API siren alerts and one-click executive PDF report printing.
