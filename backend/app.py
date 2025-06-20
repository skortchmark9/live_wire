from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'electricity-tracker', 'public', 'data')

def load_json_file(filename):
    """Load JSON file from data directory"""
    try:
        file_path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(file_path):
            logger.warning(f"File not found: {file_path}")
            return None
        
        with open(file_path, 'r') as file:
            return json.load(file)
    except Exception as e:
        logger.error(f"Error loading {filename}: {str(e)}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/api/electricity-usage', methods=['GET'])
def get_electricity_usage():
    """Get electricity usage data"""
    try:
        data = load_json_file('electricity_usage.json')
        if data is None:
            return jsonify({"error": "Electricity usage data not found"}), 404
        
        # Optional query parameters for filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = request.args.get('limit', type=int)
        
        usage_data = data.get('data', [])
        
        # Apply date filtering if provided
        if start_date or end_date:
            filtered_data = []
            for point in usage_data:
                point_date = datetime.fromisoformat(point['start_time'].replace('Z', '+00:00')).date()
                
                if start_date and point_date < datetime.fromisoformat(start_date).date():
                    continue
                if end_date and point_date > datetime.fromisoformat(end_date).date():
                    continue
                    
                filtered_data.append(point)
            usage_data = filtered_data
        
        # Apply limit if provided
        if limit:
            usage_data = usage_data[:limit]
        
        return jsonify({
            "metadata": data.get('metadata', {}),
            "data": usage_data,
            "count": len(usage_data)
        })
        
    except Exception as e:
        logger.error(f"Error in get_electricity_usage: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/weather-data', methods=['GET'])
def get_weather_data():
    """Get weather data"""
    try:
        data = load_json_file('weather_data.json')
        if data is None:
            return jsonify({"error": "Weather data not found"}), 404
        
        # Optional query parameters for filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = request.args.get('limit', type=int)
        
        weather_data = data.get('data', [])
        
        # Apply date filtering if provided
        if start_date or end_date:
            filtered_data = []
            for point in weather_data:
                point_date = datetime.fromisoformat(point['timestamp']).date()
                
                if start_date and point_date < datetime.fromisoformat(start_date).date():
                    continue
                if end_date and point_date > datetime.fromisoformat(end_date).date():
                    continue
                    
                filtered_data.append(point)
            weather_data = filtered_data
        
        # Apply limit if provided
        if limit:
            weather_data = weather_data[:limit]
        
        return jsonify({
            "metadata": data.get('metadata', {}),
            "data": weather_data,
            "count": len(weather_data)
        })
        
    except Exception as e:
        logger.error(f"Error in get_weather_data: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/predictions', methods=['GET'])
def get_predictions():
    """Get ML model predictions"""
    try:
        data = load_json_file('predictions.json')
        if data is None:
            return jsonify({"error": "Predictions data not found"}), 404
        
        # Optional query parameters
        limit = request.args.get('limit', type=int)
        
        predictions = data.get('predictions', [])
        
        # Apply limit if provided
        if limit:
            predictions = predictions[:limit]
        
        return jsonify({
            "metadata": data.get('metadata', {}),
            "predictions": predictions,
            "count": len(predictions)
        })
        
    except Exception as e:
        logger.error(f"Error in get_predictions: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/coned-forecast', methods=['GET'])
def get_coned_forecast():
    """Get ConEd billing forecast"""
    try:
        data = load_json_file('coned_forecast.json')
        if data is None:
            return jsonify({"error": "ConEd forecast data not found"}), 404
        
        return jsonify({
            "metadata": data.get('metadata', {}),
            "forecasts": data.get('forecasts', [])
        })
        
    except Exception as e:
        logger.error(f"Error in get_coned_forecast: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/data-status', methods=['GET'])
def get_data_status():
    """Get status of all data files"""
    files = ['electricity_usage.json', 'weather_data.json', 'predictions.json', 'coned_forecast.json']
    status = {}
    
    for filename in files:
        file_path = os.path.join(DATA_DIR, filename)
        if os.path.exists(file_path):
            stat = os.stat(file_path)
            status[filename] = {
                "exists": True,
                "size_bytes": stat.st_size,
                "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
            }
        else:
            status[filename] = {"exists": False}
    
    return jsonify({"data_files": status})

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    # Verify data directory exists
    if not os.path.exists(DATA_DIR):
        logger.error(f"Data directory not found: {DATA_DIR}")
        print(f"Please ensure the data directory exists at: {DATA_DIR}")
    else:
        logger.info(f"Using data directory: {DATA_DIR}")
    
    app.run(debug=True, host='0.0.0.0', port=5000)