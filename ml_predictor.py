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
        elec_path = Path("electricity-tracker/public/data/electricity_usage.json")
        weather_path = Path("electricity-tracker/public/data/weather_data.json")

        if not elec_path.exists() or not weather_path.exists():
            raise FileNotFoundError("Data files not found.")

        with open(elec_path) as f:
            elec_data = json.load(f)
        with open(weather_path) as f:
            weather_data = json.load(f)

        elec_df = pd.DataFrame(elec_data["data"])
        weather_df = pd.DataFrame(weather_data["data"])

        elec_df["start_time"] = (
            pd.to_datetime(elec_df["start_time"], utc=True)
            .dt.tz_convert("America/New_York")
            .dt.tz_localize(None)
        )
        elec_df["end_time"] = (
            pd.to_datetime(elec_df["end_time"], utc=True)
            .dt.tz_convert("America/New_York")
            .dt.tz_localize(None)
        )


        weather_df["timestamp"] = pd.to_datetime(weather_df["timestamp"])

        elec_df = elec_df.dropna(subset=["start_time", "end_time", "consumption_kwh"])
        weather_df = weather_df.dropna(subset=["timestamp"])

        elec_df = elec_df.set_index("start_time").sort_index()
        weather_df = weather_df.set_index("timestamp").sort_index()

        count = 0
        # Step 1: Find last valid weather timestamp
        last_valid_weather_index = weather_df[weather_df["temperature_f"].notnull()].index.max()
        for t in weather_df.loc[last_valid_weather_index:].index:
            if pd.isna(weather_df.at[t, "temperature_f"]):
                t_minus_24h = t - pd.Timedelta(hours=24)
                if t_minus_24h in weather_df.index:
                    weather_df.loc[t] = weather_df.loc[t_minus_24h]
                    count += 1
                else:
                    print(f"⚠ Cannot fill {t} — no data at {t_minus_24h}")

        if count:
            print(f"Filled {count} missing weather timestamps by copying from 24h prior")


        # Resample to 15-min intervals (using forward fill)
        weather_15min = weather_df.resample("15T").ffill()

        print(f"Loaded {len(elec_df)} electricity rows and {len(weather_15min)} weather rows (15-min aligned)")
        return elec_df, weather_15min

    def create_training_set(self, elec_df, weather_15min):
        df = elec_df.merge(weather_15min, left_index=True, right_index=True, how="inner")
        df = df.sort_index()

        df["hour"] = df.index.hour
        df["day_of_week"] = df.index.dayofweek
        df["month"] = df.index.month
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
        df["is_peak_hour"] = ((df["hour"] >= 12) & (df["hour"] < 20) & (df["day_of_week"] < 5)).astype(int)
        df["is_summer"] = df["month"].isin([6, 7, 8]).astype(int)
        df["is_winter"] = df["month"].isin([12, 1, 2]).astype(int)

        df["temp_deviation"] = df["temperature_f"] - 65
        df["heating_degree"] = np.maximum(0, 65 - df["temperature_f"])
        df["cooling_degree"] = np.maximum(0, df["temperature_f"] - 75)

        df["cons_kwh_lag_24h"] = df["consumption_kwh"].shift(96)
        df = df.dropna(subset=["cons_kwh_lag_24h"])

        feature_cols = [
            "hour", "day_of_week", "month", "is_weekend", "is_peak_hour",
            "is_summer", "is_winter",
            "temperature_f", "apparent_temperature_f", "humidity_percent",
            "wind_speed_mph", "cloud_cover_percent",
            "temp_deviation", "heating_degree", "cooling_degree",
            "cons_kwh_lag_24h"
        ]

        X = df[feature_cols].copy()
        y = df["consumption_kwh"].copy()
        self.feature_columns = feature_cols
        print(f"Training set: {len(X)} rows")
        return X, y

    def train(self):
        print("→ Loading data")
        elec_df, weather_15min = self.load_data()
        print("→ Creating training set")
        X, y = self.create_training_set(elec_df, weather_15min)

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
        print(f"→ Training on {len(X_train)} rows")

        self.model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

        y_pred = self.model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)

        print(f"→ MAE: {mae:.4f}  RMSE: {rmse:.4f}  R²: {r2:.4f}")

        self.is_trained = True
        return {"mae": mae, "rmse": rmse, "r2": r2}

    def predict_next_day(self):
        if not self.is_trained:
            raise RuntimeError("Train or load the model first")

        elec_df, weather_15min = self.load_data()
        last_ts = elec_df.index.max()
        next_day_midnight = datetime.combine(last_ts.date() + timedelta(days=1), time.min)

        predictions = []

        for k in range(96):
            ts = next_day_midnight + timedelta(minutes=15 * k)
            ts_yesterday = ts - timedelta(days=1)

            if ts_yesterday not in elec_df.index or ts_yesterday not in weather_15min.index:
                ## TODO: the electricity data or the weather data may not be available for the previous day
                ## What to do?
                raise KeyError(f"Missing data for {ts_yesterday}")

            lag_24h = float(elec_df.at[ts_yesterday, "consumption_kwh"])
            weather = weather_15min.loc[ts_yesterday]

            hour = ts.hour
            dow = ts.weekday()
            month = ts.month

            features = {
                "hour": hour,
                "day_of_week": dow,
                "month": month,
                "is_weekend": int(dow >= 5),
                "is_peak_hour": int((12 <= hour < 20) and dow < 5),
                "is_summer": int(month in [6, 7, 8]),
                "is_winter": int(month in [12, 1, 2]),
                "temperature_f": weather["temperature_f"],
                "apparent_temperature_f": weather["apparent_temperature_f"],
                "humidity_percent": weather["humidity_percent"],
                "wind_speed_mph": weather["wind_speed_mph"],
                "cloud_cover_percent": weather["cloud_cover_percent"],
                "temp_deviation": weather["temperature_f"] - 65,
                "heating_degree": max(0, 65 - weather["temperature_f"]),
                "cooling_degree": max(0, weather["temperature_f"] - 75),
                "cons_kwh_lag_24h": lag_24h
            }

            X_row = np.array([features[col] for col in self.feature_columns]).reshape(1, -1)
            pred = self.model.predict(X_row).item()

            predictions.append({
                "timestamp": ts.isoformat(),
                "predicted_kwh": max(0.0, float(pred))
            })

        return predictions

    def save_model(self, path="electricity-tracker/public/data/ml_model.pkl"):
        joblib.dump({
            "model": self.model,
            "feature_columns": self.feature_columns
        }, path)
        print(f"Model saved to {path}")

    def load_model(self, path="electricity-tracker/public/data/ml_model.pkl"):
        data = joblib.load(path)
        self.model = data["model"]
        self.feature_columns = data["feature_columns"]
        self.is_trained = True

def main():
    predictor = ElectricityPredictor()
    model_path = Path("electricity-tracker/public/data/ml_model.pkl")

    if model_path.exists():
        print("→ Loading existing model")
        predictor.load_model(model_path)
    else:
        print("→ Training new model")
        metrics = predictor.train()
        predictor.save_model(model_path)

    print("→ Generating forecast")
    predictions = predictor.predict_next_day()

    output_path = Path("electricity-tracker/public/data/predictions.json")
    with open(output_path, "w") as f:
        json.dump({
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "forecast_intervals": 96
            },
            "predictions": predictions
        }, f, indent=2)

    print(f"✔ Forecast written to {output_path}")

if __name__ == "__main__":
    main()
