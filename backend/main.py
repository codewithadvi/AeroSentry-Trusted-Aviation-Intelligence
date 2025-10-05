# main.py
# FINAL VERSION with Authentication, Dynamic Coords, and SIGMET Rerouting

import json
import re
import math
import asyncio
import httpx
import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from metar import Metar
from typing import List, Dict, Optional
from datetime import datetime, timezone, timedelta
from geographiclib.geodesic import Geodesic
from shapely.geometry import LineString, Polygon

# --- [NEW] Import Authentication Logic ---
from auth import (
    authenticate_user, 
    create_access_token, 
    verify_token, 
    LoginRequest, 
    Token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)


# --- Load Airport Database at Startup ---
try:
    AIRPORT_DB = pd.read_csv("airports.csv")
    AIRPORT_DB = AIRPORT_DB[AIRPORT_DB['type'].isin(['large_airport', 'medium_airport', 'small_airport'])]
    AIRPORT_DB.set_index('ident', inplace=True)
    print("✅ Successfully loaded airports.csv into memory.")
except Exception as e:
    print(f"❌ Failed to load airports.csv: {e}")
    AIRPORT_DB = pd.DataFrame()

# --- Global Variables ---
AIRPORT_COORDS = {}
CUSTOM_USER_AGENT = "AeroSentry/1.0 (hackathon.project@example.com)"
BASE_URL = "https://aviationweather.gov/api/data/"

# --- [NEW] Dependency for Token Verification ---
async def get_current_user_payload(authorization: Optional[str] = Header(None)):
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing"
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme"
        )
    
    token = parts[1]
    payload = verify_token(token)
    return payload

# --- Data Parsing Functions (Unchanged) ---
def parse_metar_to_json(metar_string: str) -> dict:
    try:
        obs = Metar.Metar(metar_string)
        ceiling_ft = 99999
        for layer in obs.sky:
            if layer[0] in ['BKN', 'OVC'] and layer[1]:
                ceiling_ft = layer[1].value()
                break
        vis_miles = obs.vis.value('SM') if obs.vis else 99.0
        flight_category = "VFR"
        if vis_miles < 1 or ceiling_ft < 500:
            flight_category = "LIFR"
        elif vis_miles < 3 or ceiling_ft < 1000:
            flight_category = "IFR"
        elif vis_miles <= 5 or ceiling_ft <= 3000:
            flight_category = "MVFR"
        weather_phenomena = []
        if obs.weather:
            for w in obs.weather:
                cleaned = [str(part) for part in w if part is not None]
                if cleaned:
                    weather_phenomena.append(" ".join(cleaned))
        return {
            "station_id": obs.station_id, "raw": obs.code, "flight_category": flight_category,
            "wind": {"direction_degrees": obs.wind_dir.value() if obs.wind_dir else None, "speed_knots": obs.wind_speed.value() if obs.wind_speed else 0},
            "visibility_miles": vis_miles, "ceiling_ft": ceiling_ft, "weather_phenomena": weather_phenomena
        }
    except Metar.ParserError as e:
        return {"error": "Failed to parse METAR string.", "details": str(e)}

def parse_taf_to_json(taf_string: str) -> dict:
    cleaned_taf = re.sub(r'^TAF(\s(AMD|COR))?\s*', '', taf_string)
    station_id = cleaned_taf.split(' ')[0]
    forecasts = []
    periods = re.split(r'\s(FM\d{6}|TEMPO\s\d{4}/\d{4})\s', cleaned_taf)
    for i in range(0, len(periods), 2):
        period_label = periods[i-1] if i > 0 else "Initial Forecast"
        period_text = periods[i]
        conditions = {}
        wind = re.search(r'(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT', period_text)
        if wind:
            conditions['wind_summary'] = wind.group(0)
        vis = re.search(r'\s(P?6SM|\d{4})\s', period_text)
        if vis:
            conditions['visibility_summary'] = vis.group(1).replace('SM', ' mi')
        conditions['period_label'] = period_label.strip()
        forecasts.append(conditions)
    return {"station_id": station_id, "forecasts": forecasts, "raw": taf_string}

# --- Live Data Fetching ---
async def fetch_live_data(session, data_type: str, airport_codes: List[str]):
    airport_string = ",".join(airport_codes)
    headers = {"User-Agent": CUSTOM_USER_AGENT}
    params = {"ids": airport_string.upper(), "format": "json"}
    try:
        response = await session.get(f"{BASE_URL}{data_type}", headers=headers, params=params, timeout=15, follow_redirects=True)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"API/Network Error for {data_type}: {e}")
        return None

async def fetch_sigmets(session: httpx.AsyncClient):
    headers = {"User-Agent": CUSTOM_USER_AGENT}
    try:
        response = await session.get(f"{BASE_URL}sigmet", headers=headers, params={"format": "json"}, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"API/Network Error for SIGMETs: {e}")
        return []

def parse_sigmets_to_polygons(sigmet_data: List[Dict]) -> List[Dict]:
    polygons = []
    for sigmet in sigmet_data:
        if 'points' in sigmet and sigmet.get('hazard') == 'TS':
            coords = [(p['lon'], p['lat']) for p in sigmet['points']]
            if len(coords) >= 3:
                polygons.append({
                    "polygon": Polygon(coords),
                    "raw_text": sigmet.get('rawSigmet', 'No raw text available.')
                })
    return polygons

# --- Intelligent Route & Geodesic Functions ---
async def get_coordinates_from_api(icao: str, session=None):
    icao = icao.upper()
    if icao in AIRPORT_COORDS:
        return AIRPORT_COORDS[icao]
    print(f"Fetching coordinates for {icao} from local OurAirports database...")
    if icao in AIRPORT_DB.index:
        row = AIRPORT_DB.loc[icao]
        lat, lon = float(row['latitude_deg']), float(row['longitude_deg'])
        AIRPORT_COORDS[icao] = (lat, lon)
        print(f"Found {icao}: ({lat:.4f}, {lon:.4f})")
        return (lat, lon)
    print(f"❌ Airport {icao} not found in local database.")
    return None

def get_dynamic_checkpoints(dep_icao: str, dest_icao: str, interval_km: int = 400) -> List[Dict]:
    if dep_icao not in AIRPORT_COORDS or dest_icao not in AIRPORT_COORDS:
        return []
    lat1, lon1 = AIRPORT_COORDS[dep_icao]
    lat2, lon2 = AIRPORT_COORDS[dest_icao]
    geod = Geodesic.WGS84
    inv = geod.Inverse(lat1, lon1, lat2, lon2)
    total_dist_meters = inv['s12']
    total_dist_km = total_dist_meters / 1000.0
    if total_dist_km <= interval_km:
        return [{"lat": lat1, "lon": lon1}, {"lat": lat2, "lon": lon2}]
    num_segments = math.ceil(total_dist_km / interval_km)
    line = geod.Line(lat1, lon1, inv['azi1'])
    points = []
    for i in range(num_segments + 1):
        dist_for_point = min(i * interval_km * 1000, total_dist_meters)
        pos = line.Position(dist_for_point)
        points.append({"lat": pos['lat2'], "lon": pos['lon2']})
        if dist_for_point == total_dist_meters:
            break
    return points

async def find_sigmet_reroute(p_prev: dict, p_next: dict, sigmet_poly: Polygon):
    lat1, lon1 = p_prev['lat'], p_prev['lon']
    lat2, lon2 = p_next['lat'], p_next['lon']
    geod = Geodesic.WGS84
    inv = geod.Inverse(lat1, lon1, lat2, lon2)
    line = geod.Line(lat1, lon1, inv['azi1'])
    midpoint = line.Position(inv['s12'] / 2.0)
    for direction in [90, -90]:
        print(f"Hazardous segment detected. Attempting detour 100km to {'right' if direction > 0 else 'left'}...")
        detour_p = geod.Direct(midpoint['lat2'], midpoint['lon2'], midpoint['azi2'] + direction, 100000)
        new_point = {"lat": detour_p['lat2'], "lon": detour_p['lon2']}
        seg1 = LineString([(p_prev['lon'], p_prev['lat']), (new_point['lon'], new_point['lat'])])
        seg2 = LineString([(new_point['lon'], new_point['lat']), (p_next['lon'], p_next['lat'])])
        if not seg1.intersects(sigmet_poly) and not seg2.intersects(sigmet_poly):
            print("✅ Safe detour waypoint found.")
            return new_point
    print("❌ Could not find a safe detour waypoint within 100km.")
    return None

def format_briefing_to_text(briefing: dict) -> str:
    # This function remains unchanged.
    dep, dest, enroute = briefing["departure_briefing"], briefing["destination_briefing"], briefing["enroute_briefing"]
    def safe_get(d, keys, default="N/A"):
        for k in keys:
            d = d[k] if isinstance(d, dict) and k in d else default
        return d
    def format_metar(m):
        if not m or "error" in m: return "No METAR available."
        cat, vis, wind_dir, wind_spd = safe_get(m, ["flight_category"]), safe_get(m, ["visibility_miles"]), safe_get(m, ["wind", "direction_degrees"]), safe_get(m, ["wind", "speed_knots"])
        wx = ", ".join(safe_get(m, ["weather_phenomena"], [])) or "None"
        wind_dir_str = f"{int(wind_dir):03d}°" if isinstance(wind_dir, (int, float)) and not math.isnan(wind_dir) else "VRB"
        wind_spd_str = f"{int(wind_spd)}" if isinstance(wind_spd, (int, float)) else "0"
        vis_str = f"{float(vis):.1f} SM" if isinstance(vis, (int, float)) else "N/A"
        return f"{cat} — Wind {wind_dir_str} at {wind_spd_str} kt, Visibility {vis_str}, Weather: {wx}"
    def format_taf(t):
        if not t or "error" in t: return "No TAF available."
        return "TEMPO periods may include reduced visibility and/or precipitation." if [f for f in t.get("forecasts", []) if "TEMPO" in f.get("period_label", "")] else "No significant temporary changes forecast."
    dep_icao, dest_icao = safe_get(dep, ["metar", "station_id"], "DEP"), safe_get(dest, ["metar", "station_id"], "DEST")
    lines = ["🛫 AEROSENTRY MISSION BRIEFING", "=" * 50, f"\n📍 DEPARTURE: {dep_icao}", f"   Current: {format_metar(dep.get('metar'))}", f"   Forecast: {format_taf(dep.get('taf'))}", f"\n📍 DESTINATION: {dest_icao}", f"   Current: {format_metar(dest.get('metar'))}", f"   Forecast: {format_taf(dest.get('taf'))}", "\n🌐 ENROUTE CONDITIONS"]
    if enroute.get("note"): lines.append(f"   ⚠️ {enroute['note']}")
    elif enroute.get("hazards_detected"):
        lines.append("   🌩️ HAZARD DETECTED: Flight path intersects active SIGMET for Thunderstorms.")
        lines.append(f"   Recommendation: {enroute.get('reroute_suggestion', {}).get('reason', 'Consult ATC for reroute options.')}")
    else: lines.append("   ✅ No significant enroute weather hazards detected.")
    risk_map = {"VFR": "VFR – Good", "MVFR": "MVFR – Marginal", "IFR": "IFR – Poor", "LIFR": "LIFR – Very Poor"}
    lines.append(f"\n📊 OVERALL RISK: {risk_map.get(briefing.get('overall_risk', 'VFR').upper(), 'Unknown')}")
    lines.append("\nℹ️  This briefing is for situational awareness. Consult official sources before flight.")
    return "\n".join(lines)

# --- FastAPI App ---
app = FastAPI(title="AeroSentry Live Briefing API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

# --- [NEW] Login Endpoint ---
@app.post("/login", response_model=Token)
async def login(request: LoginRequest):
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Include user role and full name in the token payload
    user_data_for_token = {"sub": user.username, "role": user.role, "full_name": user.full_name}
    
    access_token = create_access_token(
        data=user_data_for_token, expires_delta=access_token_expires
    )

    # Return the full user data along with the token
    user_details = {"username": user.username, "role": user.role, "full_name": user.full_name}

    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role,
        "user_data": user_details
    }

@app.get("/")
def read_root():
    return {"message": "AeroSentry API is running."}

# --- [MODIFIED] Protected Briefing Endpoint ---
@app.get("/mission-briefing")
async def get_mission_briefing(departure: str, destination: str, payload: dict = Depends(get_current_user_payload)):
    # Role check: only pilots and admins can access this
    user_role = payload.get("role")
    if user_role not in ["pilot", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    departure, destination = departure.upper(), destination.upper()
    async with httpx.AsyncClient() as session:
        dep_coords, dest_coords, metar_list, taf_list, sigmet_data = await asyncio.gather(
            get_coordinates_from_api(departure, session), get_coordinates_from_api(destination, session),
            fetch_live_data(session, "metar", [departure, destination]), fetch_live_data(session, "taf", [departure, destination]),
            fetch_sigmets(session)
        )
    if not dep_coords or not dest_coords:
        return {"error": "Could not retrieve coordinates for the specified airports."}

    weather_map = {item.get('icaoId'): parse_metar_to_json(item.get("rawOb")) for item in metar_list} if metar_list else {}
    taf_map = {item.get('icaoId'): parse_taf_to_json(item.get("rawTAF")) for item in taf_list} if taf_list else {}
    sigmet_polygons = parse_sigmets_to_polygons(sigmet_data)
    enroute_points = get_dynamic_checkpoints(departure, destination)
    final_route_points, hazards_detected, reroute_suggestion = [], False, None
    p_prev = None
    for p_next in enroute_points:
        if p_prev is None:
            p_prev = p_next
            final_route_points.append(p_prev)
            continue
        segment = LineString([(p_prev['lon'], p_prev['lat']), (p_next['lon'], p_next['lat'])])
        for sigmet in sigmet_polygons:
            if segment.intersects(sigmet['polygon']):
                hazards_detected = True
                print(f"Flight segment intersects SIGMET: {sigmet['raw_text']}")
                if not reroute_suggestion:
                    new_waypoint = await find_sigmet_reroute(p_prev, p_next, sigmet['polygon'])
                    if new_waypoint:
                        final_route_points.append(new_waypoint)
                        reroute_suggestion = {"reason": "Hazard detected. Automatic detour calculated to avoid active SIGMET."}
                break
        final_route_points.append(p_next)
        p_prev = p_next
        
    dep_risk, dest_risk = weather_map.get(departure, {}).get("flight_category", "VFR"), weather_map.get(destination, {}).get("flight_category", "VFR")
    risk_levels = {"VFR": 0, "MVFR": 1, "IFR": 2, "LIFR": 3}
    overall_risk_cat = dest_risk if risk_levels.get(dest_risk, 0) > risk_levels.get(dep_risk, 0) else dep_risk
    
    return {
        "departure_briefing": {"metar": weather_map.get(departure), "taf": taf_map.get(departure)},
        "destination_briefing": {"metar": weather_map.get(destination), "taf": taf_map.get(destination)},
        "enroute_briefing": {
            "path_data": {"start": dep_coords, "end": dest_coords, "color": overall_risk_cat.lower()},
            "sampled_points": final_route_points, "hazards_detected": hazards_detected,
            "reroute_suggestion": reroute_suggestion
        },
        "overall_risk": overall_risk_cat
    }

# --- [MODIFIED] Protected Text Briefing Endpoint ---
@app.get("/mission-briefing/text")
async def get_mission_briefing_text(departure: str, destination: str, payload: dict = Depends(get_current_user_payload)):
    # Role check
    user_role = payload.get("role")
    if user_role not in ["pilot", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    json_briefing = await get_mission_briefing(departure, destination, payload) # Pass payload to satisfy dependency
    if "error" in json_briefing:
        return {"briefing_text": f"Error: {json_briefing['error']}"}
    text_report = format_briefing_to_text(json_briefing)
    return {"briefing_text": text_report}

# --- [NEW] Example Admin-Only Endpoint ---
@app.get("/admin/analytics")
async def get_admin_analytics(payload: dict = Depends(get_current_user_payload)):
    # Role check: only admins can access this
    user_role = payload.get("role")
    if user_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires admin role")
    
    # In a real app, you would generate real analytics
    return {
        "message": f"Welcome Admin, {payload.get('full_name')}!",
        "total_briefings_today": 128,
        "reroutes_suggested": 15,
        "most_frequent_airport": "VOBL"
    }

# Add to main.py
@app.post("/api/chat")
async def chat_with_ai(request: dict, payload: dict = Depends(get_current_user_payload)):
    user_message = request.get("message", "")
    # Integrate with OpenAI, Claude, or local AI model here
    # This is a placeholder implementation
    ai_response = f"I received your question about aviation: '{user_message}'. In a real implementation, this would connect to an AI model."
    
    return {"response": ai_response}