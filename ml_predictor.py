#!/usr/bin/env python3
"""
Electricity-usage predictor (15-min intervals, next-day forecasts)

Predicts the next calendar day’s apartment electricity consumption in 96
quarter-hour steps (15-minute intervals), using a single “same-time yesterday”
lag plus hourly weather and time-based features.  Intended to run at midnight
(00:00) each day to generate the 24-hour forecast.

Structure:
1. Load historical meter data and hourly weather.
2. Build training samples where each row corresponds to one 15-min interval,
   with the target consumption for that interval and features including:
   - “consumption_kwh” at exactly 24 hours prior
   - Hourly weather metrics at that same hour yesterday
   - Time-based flags (hour, day-of-week, etc.)
3. Train an XGBoost regressor on all available intervals.
4. At midnight, call `predict_next_day()`, which:
   - Identifies the upcoming day (YYYY-MM-DD 00:00 → YYYY-MM-DD 23:45),
   - For each 15-min step, looks up yesterday’s meter value and weather at the
     same timestamp (timestamp − 24 hours),
   - Produces a 96-row forecast.
5. Save both model and daily predictions to disk.

Assumptions:
- Electricity usage JSON is at:
    electricity-tracker/public/data/electricity_usage.json
  with fields: “start_time” (ISO string), “end_time” (ISO string),
  “consumption_kwh” (float).
- Weather JSON is at:
    electricity-tracker/public/data/weather_data.json
  with fields: “timestamp” (ISO string), plus:
    temperature_f, apparent_temperature_f, humidity_percent,
    wind_speed_mph, cloud_cover_percent.
- Both files cover at least the previous 48 hours when running
  at midnight to guarantee “yesterday” data is present.
"""

import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, time
from pathlib import Path
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import warnings

warnings.filterwarnings("ignore")


class ElectricityPredictor:
    def __init__(self):
        # XGBoost regressor with modest hyperparameters
        self.model = XGBRegressor(
            n_estimators=800,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror",
            random_state=42,
            verbosity=0
        )
        self.feature_columns = []
        self.is_trained = False

    def load_data(self):
        """Load and preprocess meter & weather JSONs into DataFrames."""
        elec_path = Path("electricity-tracker/public/data/electricity_usage.json")
        weather_path = Path("electricity-tracker/public/data/weather_data.json")

        if not elec_path.exists() or not weather_path.exists():
            raise FileNotFoundError(
                "Required data files not found. "
                "Run data collection scripts first."
            )

        with open(elec_path) as f:
            elec_json = json.load(f)
        with open(weather_path) as f:
            weather_json = json.load(f)

        elec_df = pd.DataFrame(elec_json["data"])
        weather_df = pd.DataFrame(weather_json["data"])

        # Parse timestamps, drop timezone suffix if present
        elec_df["start_time"] = pd.to_datetime(
            elec_df["start_time"].str.replace(r"[+-]\d{2}:\d{2}$", "", regex=True),
            errors="coerce"
        )
        elec_df["end_time"] = pd.to_datetime(
            elec_df["end_time"].str.replace(r"[+-]\d{2}:\d{2}$", "", regex=True),
            errors="coerce"
        )
        weather_df["timestamp"] = pd.to_datetime(weather_df["timestamp"], errors="coerce")

        # Drop any rows with invalid timestamps or missing consumption
        elec_df = elec_df.dropna(subset=["start_time", "end_time", "consumption_kwh"])
        weather_df = weather_df.dropna(subset=["timestamp"])

        # Create an “hour_timestamp” column for weather merging (floor to hour)
        elec_df["hour_timestamp"] = elec_df["start_time"].dt.floor("H")
        weather_df["hour_timestamp"] = weather_df["timestamp"].dt.floor("H")

        # Build hourly weather lookup
        weather_hourly = (
            weather_df
            .set_index("hour_timestamp")
            .sort_index()
            .loc[:, [
                "temperature_f",
                "apparent_temperature_f",
                "humidity_percent",
                "wind_speed_mph",
                "cloud_cover_percent"
            ]]
        )

        # Index meter readings by 15-min start_time
        elec_df = (
            elec_df
            .set_index("start_time")
            .sort_index()[["consumption_kwh", "hour_timestamp"]]
        )

        print(f"Loaded {len(elec_df)} electricity rows and {len(weather_hourly)} hourly weather rows")
        return elec_df, weather_hourly

    def create_training_set(self, elec_df, weather_hourly):
        """
        Build a DataFrame of training samples where each row is one 15-min interval:
        - Features:
            * hour, day_of_week, month, is_weekend, is_peak_hour, is_summer, is_winter
            * temperature_f, apparent_temperature_f, humidity_percent, wind_speed_mph, cloud_cover_percent
              (all at same hour, i.e., hour_timestamp)
            * temp_deviation, heating_degree, cooling_degree
            * cons_kwh_lag_24h (value of consumption exactly 24h earlier)
        - Target:
            * consumption_kwh (current)
        """
        # Join meter + weather
        df = elec_df.merge(
            weather_hourly,
            left_on="hour_timestamp",
            right_index=True,
            how="inner"
        )
        df = df.sort_index()  # index = 15-min start_time

        # Time-based flags
        df["hour"] = df.index.hour
        df["day_of_week"] = df.index.dayofweek  # 0=Monday
        df["month"] = df.index.month
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
        df["is_peak_hour"] = (
            (df["hour"] >= 12) &
            (df["hour"] < 20) &
            (df["day_of_week"] < 5)
        ).astype(int)
        df["is_summer"] = df["month"].isin([6, 7, 8]).astype(int)
        df["is_winter"] = df["month"].isin([12, 1, 2]).astype(int)

        # Temperature deviations
        df["temp_deviation"] = df["temperature_f"] - 65
        df["heating_degree"] = np.maximum(0, 65 - df["temperature_f"])
        df["cooling_degree"] = np.maximum(0, df["temperature_f"] - 75)

        # “Same time yesterday” lag: shift index by 24 hours (96 intervals)
        df["cons_kwh_lag_24h"] = df["consumption_kwh"].shift(96)

        # Drop any rows where the 24h lag is missing (first 24 hours cannot be used)
        df = df.dropna(subset=["cons_kwh_lag_24h"])

        # Final feature list
        feature_cols = [
            "hour",
            "day_of_week",
            "month",
            "is_weekend",
            "is_peak_hour",
            "is_summer",
            "is_winter",
            "temperature_f",
            "apparent_temperature_f",
            "humidity_percent",
            "wind_speed_mph",
            "cloud_cover_percent",
            "temp_deviation",
            "heating_degree",
            "cooling_degree",
            "cons_kwh_lag_24h"
        ]

        X = df[feature_cols].copy()
        y = df["consumption_kwh"].copy()

        # Store feature column order for later use
        self.feature_columns = feature_cols
        print(f"Training set: {len(X)} samples after dropping missing 24h-lag")
        return X, y

    def train(self):
        """Train the XGBoost model on all historical 15-min intervals."""
        print("→ Loading data for training")
        elec_df, weather_hourly = self.load_data()
        print("→ Building training set (same-time yesterday lag only)")
        X, y = self.create_training_set(elec_df, weather_hourly)

        # Time series split: keep last 20% as test
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, shuffle=False
        )
        print(f"  Train: {len(X_train)} rows | Test: {len(X_test)} rows")

        print("→ Training XGBoost")
        self.model.fit(
            X_train,
            y_train,
            eval_set=[(X_test, y_test)],
            # early_stopping_rounds=30,
            verbose=False
        )

        # Evaluate on hold-out
        y_pred = self.model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)

        print("\n🔎 Model performance on hold-out set:")
        print(f"   MAE : {mae:.4f} kWh")
        print(f"   RMSE: {rmse:.4f} kWh")
        print(f"   R²  : {r2:.4f}\n")

        # Feature importance
        fi = pd.DataFrame({
            "feature": self.feature_columns,
            "importance": self.model.feature_importances_
        }).sort_values("importance", ascending=False)
        print("Top-8 features:")
        print(fi.head(8).to_string(index=False))

        self.is_trained = True
        return {"mae": mae, "rmse": rmse, "r2": r2}

    def save_model(self, path="electricity-tracker/public/data/ml_model.pkl"):
        """Persist trained model + feature_columns to disk."""
        if not self.is_trained:
            raise RuntimeError("Train the model before saving.")
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "model": self.model,
                "feature_columns": self.feature_columns
            },
            path
        )
        print(f"✔ Model saved to {path}")

    def load_model(self, path="electricity-tracker/public/data/ml_model.pkl"):
        """Load a previously trained model from disk."""
        if not Path(path).exists():
            raise FileNotFoundError(f"Model file not found: {path}")
        data = joblib.load(path)
        self.model = data["model"]
        self.feature_columns = data["feature_columns"]
        self.is_trained = True
        print(f"✔ Model loaded from {path}")

    def predict_next_day(self, weather_hourly=None):
        """
        Generate 96 forecasts (15-min intervals) for the next calendar day [00:00→23:45].
        Requires:
          - A trained model (call load_model() or train() first)
          - Historical meter readings and weather_df to be freshly loaded within this method
        Forecast algorithm:
        - Determine 'next_day_midnight' = (last_meter_timestamp.date() + 1 day) at 00:00:00
        - For each 15-min step t in [next_day_midnight + k*15m, k=0..95]:
            * Look up consumption at timestamp = t − 24 hours  → cons_kwh_lag_24h
            * Look up weather at hour = (t − 24h).floor(H) from weather_hourly
            * Construct feature row, then predict
        - Return a list of dicts { "timestamp": ISO, "predicted_kwh": float }
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained or loaded before prediction.")

        # Reload data to get 'last_meter_timestamp' and weather
        elec_df, wh = self.load_data()
        history = elec_df.copy()  # index = 15-min start_time, columns = ['consumption_kwh']

        # If caller didn’t provide weather_hourly, use the loaded one
        weather_hourly = wh

        # Find last timestamp in history and compute next day’s midnight
        last_ts = history.index.max()
        next_day_date = (last_ts.date() + timedelta(days=1))
        next_day_midnight = datetime.combine(next_day_date, time(0, 0, 0))

        # Build 96 consecutive timestamps at 15-min intervals
        forecast_times = [
            next_day_midnight + timedelta(minutes=15 * k) for k in range(96)
        ]

        predictions = []

        for ts in forecast_times:
            ts_yesterday = ts - timedelta(days=1)
            # Check that history has that exact timestamp
            if ts_yesterday not in history.index:
                raise KeyError(
                    f"Missing meter reading for {ts_yesterday.isoformat()}; "
                    "cannot build 24h-lag feature."
                )
            lag_24h = float(history.at[ts_yesterday, "consumption_kwh"])

            # Weather features: use the hour of ts_yesterday floored to hour
            hour_key = ts_yesterday.replace(minute=0, second=0, microsecond=0)
            if hour_key not in weather_hourly.index:
                raise KeyError(
                    f"Missing weather data for hour {hour_key.isoformat()}; "
                    "cannot build weather features."
                )
            temp = float(weather_hourly.at[hour_key, "temperature_f"])
            app_temp = float(weather_hourly.at[hour_key, "apparent_temperature_f"])
            humidity = float(weather_hourly.at[hour_key, "humidity_percent"])
            wind_spd = float(weather_hourly.at[hour_key, "wind_speed_mph"])
            cloud_cov = float(weather_hourly.at[hour_key, "cloud_cover_percent"])

            # Time flags for ts (forecast point)
            hour = ts.hour
            dow = ts.weekday()
            month = ts.month
            is_weekend = int(dow >= 5)
            is_peak = int((hour >= 12) and (hour < 20) and (dow < 5))
            is_summer = int(month in [6, 7, 8])
            is_winter = int(month in [12, 1, 2])

            temp_dev = temp - 65.0
            heating_deg = max(0.0, 65.0 - temp)
            cooling_deg = max(0.0, temp - 75.0)

            # Construct feature vector
            feat = {
                "hour": hour,
                "day_of_week": dow,
                "month": month,
                "is_weekend": is_weekend,
                "is_peak_hour": is_peak,
                "is_summer": is_summer,
                "is_winter": is_winter,
                "temperature_f": temp,
                "apparent_temperature_f": app_temp,
                "humidity_percent": humidity,
                "wind_speed_mph": wind_spd,
                "cloud_cover_percent": cloud_cov,
                "temp_deviation": temp_dev,
                "heating_degree": heating_deg,
                "cooling_degree": cooling_deg,
                "cons_kwh_lag_24h": lag_24h
            }

            # Align column order
            X_row = np.array([feat[col] for col in self.feature_columns]).reshape(1, -1)
            y_pred = self.model.predict(X_row).item()

            predictions.append({
                "timestamp": ts.isoformat(),
                "predicted_kwh": max(0.0, float(y_pred))
            })

        return predictions


def main():
    """Orchestrate training (or loading) and write tomorrow’s forecast to JSON."""
    predictor = ElectricityPredictor()

    # Decide: if a saved model exists, load it; otherwise, train from scratch
    model_path = Path("electricity-tracker/public/data/ml_model.pkl")
    if model_path.exists():
        print("→ Loading existing model")
        predictor.load_model(str(model_path))
    else:
        print("→ No saved model found; training afresh")
        metrics = predictor.train()
        predictor.save_model(str(model_path))

    # Generate next-day forecast (to run at midnight)
    print("→ Generating next-day forecast")
    predictions = predictor.predict_next_day()

    # Write JSON output
    output_path = Path("electricity-tracker/public/data/predictions.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump({
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "forecast_horizon": "next_calendar_day",
                "forecast_intervals": 96
            },
            "predictions": predictions
        }, f, indent=2)

    print(f"✔ Forecast written to {output_path}")


if __name__ == "__main__":
    main()
