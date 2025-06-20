# Live Wire Flask Backend

This is the Flask backend API for the Live Wire electricity tracking application.

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

3. Run the Flask app:
```bash
python app.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Health Check
- `GET /health` - Check if the API is running

### Data Endpoints
- `GET /api/electricity-usage` - Get electricity usage data
  - Query params: `start_date`, `end_date`, `limit`
- `GET /api/weather-data` - Get weather data
  - Query params: `start_date`, `end_date`, `limit`
- `GET /api/predictions` - Get ML model predictions
  - Query params: `limit`
- `GET /api/coned-forecast` - Get ConEd billing forecast
- `GET /api/data-status` - Get status of all data files

## Data Source

The Flask app reads from the existing JSON files in the `electricity-tracker/public/data/` directory. This allows for a smooth transition from the current hardcoded JSON setup to a proper API.

## CORS

CORS is enabled to allow the Next.js frontend (running on port 3000) to communicate with this Flask backend (running on port 5000).