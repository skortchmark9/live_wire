# Live Wire FastAPI Backend

This is the FastAPI backend API for the Live Wire electricity tracking application with async data collection capabilities.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set environment variables:
```bash
export CONED_PASSWORD="your_coned_password"
```

4. Run the FastAPI app:
```bash
python app.py
```

The API will be available at `http://localhost:5000`
Interactive API docs are available at `http://localhost:5000/docs`

## API Endpoints

### Health Check
- `GET /health` - Check if the API is running

### Data Endpoints
- `GET /api/electricity-data` - Get combined electricity usage and forecast data (single request)
  - Query params: `start_date`, `end_date`, `limit`
  - Returns both usage_data and forecast_data in one response
- `GET /api/electricity-usage` - Get electricity usage data only
  - Query params: `start_date`, `end_date`, `limit`
- `GET /api/weather-data` - Get weather data
  - Query params: `start_date`, `end_date`, `limit`
- `GET /api/predictions` - Get ML model predictions
  - Query params: `limit`
- `GET /api/coned-forecast` - Get ConEd billing forecast only
- `GET /api/data-status` - Get status of all data files

### Data Collection Endpoints
- `POST /api/collect/weather` - Trigger weather data collection
- `POST /api/collect/electricity` - Trigger electricity data collection
- `GET /api/collect/status` - Get status of all collection operations
- `GET /api/collect/status/{collection_type}` - Get status of specific collection

## Features

- **Async Data Collection**: Background tasks for collecting data without blocking the API
- **Real-time Status**: Monitor data collection progress and status
- **Environment-based Credentials**: Secure handling of ConEd credentials via environment variables
- **Automatic API Documentation**: FastAPI generates interactive docs at `/docs`

## Data Collection

The API can trigger data collection scripts asynchronously:

1. **Weather Data**: Shared across all users, collects from Open-Meteo API
2. **Electricity Data**: User-specific, requires ConEd credentials (currently hardcoded for initial user)

## CORS

CORS is enabled to allow the Next.js frontend (running on port 3000) to communicate with this FastAPI backend (running on port 5000).