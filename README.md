# 🌍 Dashboard de Lotes - Dashboard GIS 🏘️

A premium, interactive GIS dashboard built with **React, Vite, and FastAPI**, designed for managing and visualizing lot data with high precision and rich aesthetics.

## ✨ Features
- 📊 **Interactive GIS Visualization**: Map-centric interface for lot management using Leaflet.
- 🏢 **Backend Integration**: Robust logic for data processing out of Earth Engine.
- 🎨 **Modern UI/UX**: Sleek, responsive design with polished components using Tailwind CSS.
- ⚡ **Real-time Updates**: Fast data processing and seamless dashboard updates.

## 🚀 Getting Started

Follow these steps to get the dashboard running locally:

### ⚙️ Prerequisites
- Node.js (v18+)
- Python 3.8+
- [Pip](https://pip.pypa.io/en/stable/installation/)

### 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rodriquinteros9-cloud/dashboard-lotes.git
   cd dashboard-lotes
   ```

2. **Start the Backend (FastAPI):**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. **Start the Frontend (React):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 📂 Project Structure
- `backend/`: Data processing and GIS logic using FastAPI.
- `frontend/`: Custom frontend UI, React components, and 3rd party integrations.

## 🛡️ License
Distributed under the MIT License. See `LICENSE` for more information.

---
Crafted with ❤️ for precision and efficiency.
