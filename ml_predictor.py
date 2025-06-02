#!/usr/bin/env python3
"""
Machine Learning model for electricity usage prediction.
Uses historical electricity usage and weather data to predict future consumption.

Key update (2025‑06‑02)
----------------------
`predict_next_24h()` now generates its forecast **directly from the trained
RandomForest model**.  It builds the exact feature matrix expected by the model
for each of the next 96 quarter‑hour intervals (24 h × 4) using:
• The true consumption values from the previous 24 h (and subsequently each
  newly‑predicted point) to populate the lag/rolling features.
• Either a supplied hourly weather‑forecast DataFrame *or* the most recent
  observed hourly weather for temperature, humidity, wind, etc.
The function returns a list of hourly totals (kWh) to maintain the same output
shape used elsewhere in the application, but you can switch to 15‑minute
resolution by flipping the `aggregate_hourly` flag.
"""

import json
import warnings
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")


class ElectricityPredictor:
    """End‑to‑end pipeline for load prediction."""

    # ---------------------------------------------------------------------
    # Initialise / persistence helpers
    # ---------------------------------------------------------------------
    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=15,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
        )
        self.scaler = StandardScaler()
        self.feature_columns: Optional[List[str]] = None
        self.is_trained: bool = False

    # ------------------------------------------------------------------
    # Data loading & feature engineering (unchanged except minor tweaks)
    # ------------------------------------------------------------------
    def load_data(self):
        """Load raw electricity & weather JSON files into DataFrames."""
        elec_file = Path("electricity-tracker/public/data/electricity_usage.json")
        weather_file = Path("electricity-tracker/public/data/weather_data.json")

        if not elec_file.exists() or not weather_file.exists():
            raise FileNotFoundError("Data files not found. Run data collection scripts first.")

        with elec_file.open() as f:
            elec_data = json.load(f)
        with weather_file.open() as f:
            weather_data = json.load(f)

        elec_df = pd.DataFrame(elec_data["data"])
        weather_df = pd.DataFrame(weather_data["data"])

        # Parse datetimes (strip timezone offsets for simplicity)
        elec_df["start_time"] = pd.to_datetime(
            elec_df["start_time"].str.replace(r"[+-]\d{2}:\d{2}$", "", regex=True),
            errors="coerce",
        )
        elec_df["end_time"] = pd.to_datetime(
            elec_df["end_time"].str.replace(r"[+-]\d{2}:\d{2}$", "", regex=True),
            errors="coerce",
        )
        weather_df["timestamp"] = pd.to_datetime(weather_df["timestamp"], errors="coerce")

        elec_df.dropna(subset=["start_time", "end_time", "consumption_kwh"], inplace=True)
        weather_df.dropna(subset=["timestamp"], inplace=True)

        elec_df["hour_timestamp"] = elec_df["start_time"].dt.floor("H")
        weather_df["hour_timestamp"] = weather_df["timestamp"].dt.floor("H")

        print(f"Loaded {len(elec_df)} electricity records and {len(weather_df)} weather records")
        return elec_df, weather_df

    def create_features(self, elec_df: pd.DataFrame, weather_df: pd.DataFrame) -> pd.DataFrame:
        """Merge electricity & weather data and derive model features."""
        weather_hourly = weather_df.set_index("hour_timestamp")[
            [
                "temperature_f",
                "apparent_temperature_f",
                "humidity_percent",
                "wind_speed_mph",
                "cloud_cover_percent",
            ]
        ]

        df = (
            elec_df.merge(
                weather_hourly, left_on="hour_timestamp", right_index=True, how="inner"
            )
            .sort_values("start_time")
            .copy()
        )
        print(f"After merging: {len(df)} records with both electricity and weather data")

        # Temporal features
        df["hour"] = df["start_time"].dt.hour
        df["day_of_week"] = df["start_time"].dt.dayofweek
        df["month"] = df["start_time"].dt.month
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
        df["is_peak_hour"] = (
            (df["hour"].between(12, 19)) & (df["day_of_week"] < 5)
        ).astype(int)
        df["is_summer"] = df["month"].isin([6, 7, 8]).astype(int)
        df["is_winter"] = df["month"].isin([12, 1, 2]).astype(int)

        # Weather‑derived features
        df["temp_deviation"] = df["temperature_f"] - 65
        df["heating_degree"] = np.maximum(0, 65 - df["temperature_f"])
        df["cooling_degree"] = np.maximum(0, df["temperature_f"] - 75)

        # Lag / rolling statistics
        df["consumption_lag_1h"] = df["consumption_kwh"].shift(4)
        df["consumption_lag_24h"] = df["consumption_kwh"].shift(96)
        df["consumption_mean_24h"] = (
            df["consumption_kwh"].rolling(96, min_periods=24).mean().shift(1)
        )

        df.dropna(
            subset=["consumption_lag_1h", "consumption_lag_24h", "consumption_mean_24h"],
            inplace=True,
        )
        print(f"Created feature matrix with {len(df)} samples")
        return df

    # ---------------------------- Training helpers ----------------------------
    def _feature_target_split(self, df: pd.DataFrame):
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
            "consumption_lag_1h",
            "consumption_lag_24h",
            "consumption_mean_24h",
        ]
        self.feature_columns = feature_cols
        X = df[feature_cols].copy()
        y = df["consumption_kwh"].copy()
        return X, y

    def train(self):
        print("Loading data …")
        elec_df, weather_df = self.load_data()
        print("Creating features …")
        full_df = self.create_features(elec_df, weather_df)
        X, y = self._feature_target_split(full_df)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, shuffle=False
        )

        X_train_s = self.scaler.fit_transform(X_train)
        X_test_s = self.scaler.transform(X_test)

        print("Training model …")
        self.model.fit(X_train_s, y_train)

        y_pred = self.model.predict(X_test_s)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)

        print("\nModel performance:")
        print(f"MAE  = {mae:.4f} kWh")
        print(f"RMSE = {rmse:.4f} kWh")
        print(f"R²   = {r2:.4f}")

        self.is_trained = True
        return {"mae": mae, "rmse": rmse, "r2": r2}

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def save_model(self, path: str = "electricity-tracker/public/data/ml_model.pkl"):
        if not self.is_trained:
            raise ValueError("Model must be trained before saving")
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "model": self.model,
                "scaler": self.scaler,
                "feature_columns": self.feature_columns,
            },
            path,
        )
        print(f"Model saved → {path}")

    def load_model(self, path: str = "electricity-tracker/public/data/ml_model.pkl"):
        if not Path(path).exists():
            raise FileNotFoundError(f"Model file not found: {path}")
        data = joblib.load(path)
        self.model = data["model"]
        self.scaler = data["scaler"]
        self.feature_columns = data["feature_columns"]
        self.is_trained = True
        print(f"Model loaded ← {path}")

    # ------------------------------------------------------------------
    # Inference helpers
    # ------------------------------------------------------------------
    def _get_weather_for_ts(
        self,
        ts: pd.Timestamp,
        weather_hist: pd.DataFrame,
        weather_forecast: Optional[pd.DataFrame] = None,
    ) -> Dict[str, float]:
        """Return the weather row matching **ts.floor('H')**.
        Priority: `weather_forecast` → `weather_hist` → last known hist row."""
        hour_ts = ts.floor("H")
        cols = [
            "temperature_f",
            "apparent_temperature_f",
            "humidity_percent",
            "wind_speed_mph",
            "cloud_cover_percent",
        ]

        if weather_forecast is not None and hour_ts in weather_forecast.index:
            return weather_forecast.loc[hour_ts, cols].to_dict()

        if hour_ts in weather_hist.index:
            return weather_hist.loc[hour_ts, cols].to_dict()

        # Fallback – most recent historical measurement
        return weather_hist.iloc[-1][cols].to_dict()

    def predict_next_24h(
        self,
        weather_forecast: Optional[pd.DataFrame] = None,
        aggregate_hourly: bool = True,
    ) -> List[Dict[str, float]]:
        """Predict electricity usage for the next 24 hours using the trained model.

        Parameters
        ----------
        weather_forecast : DataFrame, optional
            Hourly weather forecast indexed by *hour_timestamp* with the same
            columns used during training.  If omitted, the most recent observed
            weather values are used as a proxy.
        aggregate_hourly : bool, default True
            If ``True`` (default) return *hourly* totals (24 rows).  If ``False``
            return raw quarter‑hour predictions (96 rows).
        """
        if not self.is_trained:
            raise ValueError("Model must be trained or loaded before prediction")

        # ------------------------------------------------------------------
        # Fetch latest historical data & construct initial state
        # ------------------------------------------------------------------
        elec_df, weather_df = self.load_data()
        full_df = self.create_features(elec_df, weather_df)
        full_df.sort_values("start_time", inplace=True)

        # For weather lookup convenience
        weather_hist_hourly = weather_df.set_index("hour_timestamp")

        # Maintain a deque of the last 96 consumption values (24 h)
        consumption_hist = deque(full_df["consumption_kwh"].tail(96).tolist(), maxlen=96)
        if len(consumption_hist) < 96:
            raise RuntimeError("Not enough historical data (need ≥ 24h) for forecasting")

        results_15min: List[Dict[str, float]] = []
        last_ts = full_df.iloc[-1]["start_time"]

        for step in range(96):  # Next 96 × 15‑min intervals
            ts = last_ts + timedelta(minutes=15 * (step + 1))

            # Weather features (forecast → hist → fallback)
            weather_vals = self._get_weather_for_ts(ts, weather_hist_hourly, weather_forecast)

            # Derived features
            hour = ts.hour
            day_of_week = ts.dayofweek
            month = ts.month
            is_weekend = int(day_of_week >= 5)
            is_peak_hour = int(hour >= 12 and hour < 20 and day_of_week < 5)
            is_summer = int(month in (6, 7, 8))
            is_winter = int(month in (12, 1, 2))
            temp_deviation = weather_vals["temperature_f"] - 65
            heating_degree = max(0, 65 - weather_vals["temperature_f"])
            cooling_degree = max(0, weather_vals["temperature_f"] - 75)

            # Lag / rolling – all in kWh (quarter‑hour periods)
            consumption_lag_1h = consumption_hist[-4]
            consumption_lag_24h = consumption_hist[0]
            consumption_mean_24h = float(np.mean(consumption_hist))

            row = {
                "hour": hour,
                "day_of_week": day_of_week,
                "month": month,
                "is_weekend": is_weekend,
                "is_peak_hour": is_peak_hour,
                "is_summer": is_summer,
                "is_winter": is_winter,
                **weather_vals,
                "temp_deviation": temp_deviation,
                "heating_degree": heating_degree,
                "cooling_degree": cooling_degree,
                "consumption_lag_1h": consumption_lag_1h,
                "consumption_lag_24h": consumption_lag_24h,
                "consumption_mean_24h": consumption_mean_24h,
            }

            X_row = pd.DataFrame([row])[self.feature_columns]
            y_hat = float(self.model.predict(self.scaler.transform(X_row))[0])

            # Record & update rolling history
            results_15min.append({"timestamp": ts.isoformat(), "predicted_kwh": y_hat})
            consumption_hist.append(y_hat)

        # ------------------------------------------------------------------
        # Optional hourly aggregation (sum of four quarter‑hour values)
        # ------------------------------------------------------------------
        if aggregate_hourly:
            hourly: Dict[str, float] = {}
            for entry in results_15min:
                ts = datetime.fromisoformat(entry["timestamp"])
                hour_ts = ts.replace(minute=0, second=0, microsecond=0).isoformat()
                hourly.setdefault(hour_ts, 0.0)
                hourly[hour_ts] += entry["predicted_kwh"]
            return [
                {"timestamp": ts, "predicted_kwh": val} for ts, val in sorted(hourly.items())
            ]

        return results_15min


# ----------------------------------------------------------------------
# CLI helper
# ----------------------------------------------------------------------

def main():
    predictor = ElectricityPredictor()
    try:
        metrics = predictor.train()
        predictor.save_model()
        preds = predictor.predict_next_24h()

        pred_file = Path("electricity-tracker/public/data/predictions.json")
        pred_file.parent.mkdir(parents=True, exist_ok=True)
        with pred_file.open("w") as f:
            json.dump(
                {
                    "metadata": {
                        "generated_at": datetime.now().isoformat(),
                        "model_metrics": metrics,
                        "forecast_hours": 24,
                    },
                    "predictions": preds,
                },
                f,
                indent=2,
            )
        print(f"\nPredictions saved → {pred_file}")
        print("✅ ML model training completed successfully!")
    except Exception as exc:
        print(f"❌ Error training model: {exc}")
        return False
    return True


if __name__ == "__main__":
    main()
