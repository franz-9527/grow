from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .database import SHANGHAI, now_iso, session, today_iso


LATITUDE = 30.00
LONGITUDE = 120.58


def _local_iso(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SHANGHAI)
    return parsed.isoformat(timespec="minutes")


def _is_daylight(sunrise: str | None, sunset: str | None) -> bool:
    try:
        now = datetime.now(SHANGHAI)
        start = datetime.fromisoformat(sunrise) if sunrise else None
        end = datetime.fromisoformat(sunset) if sunset else None
        if start is not None and start.tzinfo is None:
            start = start.replace(tzinfo=SHANGHAI)
        if end is not None and end.tzinfo is None:
            end = end.replace(tzinfo=SHANGHAI)
        if start is not None and end is not None:
            return start <= now < end
    except ValueError:
        pass
    return 6 <= datetime.now(SHANGHAI).hour < 18


def _weather_label(code: int) -> tuple[str, str]:
    if code in (0, 1):
        return "sunny", "晴"
    if code in (2, 3):
        return "mist", "多云"
    if code in (45, 48):
        return "mist", "雾"
    if code in (51, 53, 55):
        return "rain", "毛毛雨"
    if code in (56, 57, 61, 63, 65, 66, 67, 80, 81, 82):
        return "rain", "有雨"
    if code in (71, 73, 75, 77, 85, 86):
        return "mist", "雨夹雪或雪"
    if code in (95, 96, 99):
        return "rain", "雷雨"
    return "mist", "阴"


def refresh_weather() -> dict:
    params = urlencode(
        {
            "latitude": LATITUDE,
            "longitude": LONGITUDE,
            "timezone": "Asia/Shanghai",
            "forecast_days": 7,
            "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset",
        }
    )
    request = Request(
        f"https://api.open-meteo.com/v1/forecast?{params}",
        headers={"User-Agent": "grow.20m.cc/1.0"},
    )
    with urlopen(request, timeout=6) as response:
        payload = json.load(response)

    daily = payload["daily"]
    current = payload.get("current", {})
    humidity = current.get("relative_humidity_2m")
    current_code = current.get("weather_code")
    current_is_day = current.get("is_day")
    sunrises = daily.get("sunrise") or []
    sunsets = daily.get("sunset") or []
    now = now_iso()
    with session() as conn:
        for index, weather_date in enumerate(daily["time"]):
            code = int(
                current_code
                if index == 0 and current_code is not None
                else daily["weather_code"][index]
            )
            scene, condition = _weather_label(code)
            sunrise = _local_iso(sunrises[index]) if index < len(sunrises) else None
            sunset = _local_iso(sunsets[index]) if index < len(sunsets) else None
            conn.execute(
                """INSERT INTO weather_daily
                (weather_date, scene, condition, weather_code, temperature_min, temperature_max,
                 rainfall_mm, wind_kmh, humidity, sunrise, sunset, is_day, source, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open-meteo', ?)
                ON CONFLICT(weather_date) DO UPDATE SET
                    scene=excluded.scene,
                    condition=excluded.condition,
                    weather_code=excluded.weather_code,
                    temperature_min=excluded.temperature_min,
                    temperature_max=excluded.temperature_max,
                    rainfall_mm=excluded.rainfall_mm,
                    wind_kmh=excluded.wind_kmh,
                    humidity=excluded.humidity,
                    sunrise=excluded.sunrise,
                    sunset=excluded.sunset,
                    is_day=excluded.is_day,
                    source=excluded.source,
                    fetched_at=excluded.fetched_at""",
                (
                    weather_date,
                    scene,
                    condition,
                    code,
                    daily["temperature_2m_min"][index],
                    daily["temperature_2m_max"][index],
                    daily["precipitation_sum"][index],
                    daily["wind_speed_10m_max"][index],
                    humidity if index == 0 else None,
                    sunrise,
                    sunset,
                    int(current_is_day) if index == 0 and current_is_day is not None else None,
                    now,
                ),
            )
    return get_today_weather()


def get_today_weather() -> dict:
    with session() as conn:
        row = conn.execute(
            "SELECT * FROM weather_daily WHERE weather_date = ?",
            (today_iso(),),
        ).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT * FROM weather_daily ORDER BY weather_date DESC LIMIT 1"
            ).fetchone()
    if row is None:
        return {
            "date": today_iso(),
            "scene": "sunny",
            "condition": "天气待更新",
            "temperatureMin": None,
            "temperatureMax": None,
            "rainfallMm": 0,
            "windKmh": 0,
            "humidity": None,
            "sunrise": None,
            "sunset": None,
            "isDay": _is_daylight(None, None),
            "source": "fallback",
            "fetchedAt": now_iso(),
        }
    sunrise = row["sunrise"]
    sunset = row["sunset"]
    return {
        "date": row["weather_date"],
        "scene": row["scene"],
        "condition": row["condition"],
        "weatherCode": row["weather_code"],
        "temperatureMin": row["temperature_min"],
        "temperatureMax": row["temperature_max"],
        "rainfallMm": row["rainfall_mm"],
        "windKmh": row["wind_kmh"],
        "humidity": row["humidity"],
        "sunrise": sunrise,
        "sunset": sunset,
        "isDay": _is_daylight(sunrise, sunset),
        "source": row["source"],
        "fetchedAt": row["fetched_at"],
    }


def weather_is_stale() -> bool:
    weather = get_today_weather()
    if weather['source'] != 'open-meteo' or weather['date'] != today_iso():
        return True
    if not weather.get('sunrise') or not weather.get('sunset'):
        return True
    try:
        fetched = datetime.fromisoformat(weather["fetchedAt"])
    except (TypeError, ValueError):
        return True
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=SHANGHAI)
    return (datetime.now(SHANGHAI) - fetched).total_seconds() > 3 * 3600
