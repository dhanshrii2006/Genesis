"""
FastAPI Application for Crop Stress Prediction
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import os
import json
from xgboost import XGBClassifier
import shap

# Initialize FastAPI app
app = FastAPI(
    title="Crop Stress Monitoring API",
    description="ML-powered crop stress prediction system for precision agriculture",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')
MODEL_PATH = os.path.join(MODELS_DIR, 'crop_stress_model.json')
TRAIN_DATA_PATH = os.path.join(MODELS_DIR, 'X_train.csv')
FEATURES_PATH = os.path.join(MODELS_DIR, 'feature_columns.json')

# Load model
try:
    best_model = XGBClassifier()
    best_model.load_model(MODEL_PATH)
    print("✅ Model loaded successfully")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    best_model = None

# Load training data
try:
    X_train = pd.read_csv(TRAIN_DATA_PATH)
    print("✅ Training data loaded")
except Exception as e:
    print(f"❌ Error loading training data: {e}")
    X_train = None

# Load feature columns
try:
    with open(FEATURES_PATH, 'r') as f:
        X_cols = json.load(f)
    print("✅ Feature columns loaded")
except Exception as e:
    print(f"❌ Error loading features: {e}")
    X_cols = None

# Stress mapping
STRESS_MAP = {0: "Healthy", 1: "Moderate Stress", 2: "Severe Stress"}

# Initialize SHAP Explainer (only if model and training data loaded)
shap_explainer = None
try:
    if best_model is not None and X_train is not None:
        shap_explainer = shap.TreeExplainer(best_model)
        print("✅ SHAP Explainer initialized")
except Exception as e:
    print(f"⚠️  SHAP Explainer initialization failed: {e}")

# Friendly feature names for farmers
FEATURE_NAMES_FRIENDLY = {
    'T2M': '🌡️ Temperature (°C)',
    'RH2M': '💨 Humidity (%)',
    'T2MDEW': '🌡️ Dew Point (°C)',
    'temp_deviation_from_normal': '📊 Temp Deviation',
    'consecutive_dry_days': '☀️ Consecutive Dry Days',
    'Elevation_Data': '⛰️ Elevation',
    'Rainfall': '🌧️ Rainfall (mm)',
    'Wind_Speed': '💨 Wind Speed',
    'Soil_Moisture': '💧 Soil Moisture (%)',
    'Soil_pH': '🧪 Soil pH',
    'Organic_Matter': '🌱 Organic Matter',
    'Pest_Hotspots': '🐛 Pest Hotspots',
    'Weed_Coverage': '🌾 Weed Coverage',
    'Pest_Damage': '🐛 Pest Damage (%)',
    'Crop_Type_Rice': '🌾 Rice Crop',
    'Crop_Type_Wheat': '🌽 Wheat Crop',
    'Texture_Clay loam': '🏜️ Texture: Clay Loam',
    'Texture_Loam': '🏜️ Texture: Loam',
    'Texture_Sandy clay loam': '🏜️ Texture: Sandy Clay Loam',
    'Crop_Growth_Stage_2.0': '🌱 Growth Stage 2',
    'Crop_Growth_Stage_3.0': '🌱 Growth Stage 3',
    'Crop_Growth_Stage_4.0': '🌱 Growth Stage 4',
    'Season_Summer': '🌞 Summer Season',
    'Season_Winter': '❄️ Winter Season',
    'Season_Monsoon': '🌧️ Monsoon Season',
    'pest_damage_x_moisture': '🔗 Pest Damage × Moisture',
    'pest_damage_x_temp_deviation': '🔗 Pest Damage × Temp Deviation',
    'pest_hotspots_x_rainfall': '🔗 Pest Hotspots × Rainfall',
}

# Request model
class PredictionRequest(BaseModel):
    season: str
    crop_type: str
    temperature: float
    rainfall: float
    soil_moisture: float
    pest_damage: float

@app.get('/')
def root():
    """Root endpoint"""
    return {"message": "Crop Stress API is running"}

@app.post('/api/predict')
def predict(request_data: PredictionRequest):
    """API endpoint for crop stress prediction with SHAP explanations"""
    try:
        # Validate input ranges
        VALIDATION_RULES = {
            'temperature': (-50, 60),
            'rainfall': (0, 500),
            'soil_moisture': (0, 100),
            'pest_damage': (0, 100)
        }
        
        validation_errors = []
        if not (VALIDATION_RULES['temperature'][0] <= request_data.temperature <= VALIDATION_RULES['temperature'][1]):
            validation_errors.append(f"Temperature must be between -50 and 60°C")
        if not (VALIDATION_RULES['rainfall'][0] <= request_data.rainfall <= VALIDATION_RULES['rainfall'][1]):
            validation_errors.append(f"Rainfall must be between 0 and 500mm")
        if not (VALIDATION_RULES['soil_moisture'][0] <= request_data.soil_moisture <= VALIDATION_RULES['soil_moisture'][1]):
            validation_errors.append(f"Soil Moisture must be between 0 and 100%")
        if not (VALIDATION_RULES['pest_damage'][0] <= request_data.pest_damage <= VALIDATION_RULES['pest_damage'][1]):
            validation_errors.append(f"Pest Damage must be between 0 and 100%")
        
        if validation_errors:
            return {'success': False, 'error': ' | '.join(validation_errors)}
        
        if best_model is None or X_train is None or X_cols is None:
            return {'success': False, 'error': 'Model not loaded'}
        
        # Create baseline with average values
        baseline = X_train.mean().to_dict()
        
        # Parse user input
        user_season = request_data.season
        user_crop = request_data.crop_type
        user_temp = float(request_data.temperature)
        user_rainfall = float(request_data.rainfall)
        user_moisture = float(request_data.soil_moisture)
        user_pest_damage = float(request_data.pest_damage)
        
        # Reset categorical flags
        for col in X_cols:
            if "Season_" in col or "Crop_Type_" in col:
                baseline[col] = 0
        
        # Set user-selected flags
        season_col = f"Season_{user_season}"
        crop_col = f"Crop_Type_{user_crop}"
        
        if season_col in baseline:
            baseline[season_col] = 1
        else:
            # If season not found, try to set it (handle case mismatch)
            found_season = False
            for col in X_cols:
                if col.startswith("Season_") and col.endswith(user_season):
                    baseline[col] = 1
                    found_season = True
                    break
            if not found_season and season_col != "Season_Monsoon":
                pass  # Season not in model
                
        if crop_col in baseline:
            baseline[crop_col] = 1
        else:
            # If crop not found, try to set it (handle case mismatch)
            found_crop = False
            for col in X_cols:
                if col.startswith("Crop_Type_") and col.endswith(user_crop):
                    baseline[col] = 1
                    found_crop = True
                    break
        
        # Update numerical values
        baseline['T2M'] = user_temp
        baseline['Rainfall'] = user_rainfall
        baseline['Soil_Moisture'] = user_moisture
        baseline['Pest_Damage'] = user_pest_damage
        
        # Recalculate interaction features
        baseline['pest_damage_x_moisture'] = baseline['Pest_Damage'] * baseline['Soil_Moisture']
        baseline['pest_damage_x_temp_deviation'] = baseline['Pest_Damage'] * baseline.get('temp_deviation_from_normal', 0)
        baseline['pest_hotspots_x_rainfall'] = baseline.get('Pest_Hotspots', 0) * baseline['Rainfall']
        
        # Make prediction
        live_data = pd.DataFrame([baseline])[X_cols]
        prediction_code = best_model.predict(live_data)[0]
        prediction_text = STRESS_MAP[int(prediction_code)]
        
        # Get confidence scores
        proba = best_model.predict_proba(live_data)[0]
        confidence = float(np.max(proba)) * 100
        
        # Generate SHAP explanation
        shap_values = None
        feature_importance = []
        try:
            if shap_explainer is not None:
                # Get SHAP values for this prediction
                shap_vals = shap_explainer.shap_values(live_data)
                
                # Get the SHAP values for the predicted class
                predicted_class = int(prediction_code)
                class_shap_values = shap_vals[predicted_class][0]
                
                # Create feature importance list
                base_value = shap_explainer.expected_value[predicted_class]
                
                for idx, col_name in enumerate(X_cols):
                    shap_val = float(class_shap_values[idx])
                    # Friendly name
                    friendly_name = FEATURE_NAMES_FRIENDLY.get(col_name, col_name)
                    
                    # Get feature value
                    feature_val = live_data[col_name].values[0]
                    
                    feature_importance.append({
                        'feature': col_name,
                        'friendly_name': friendly_name,
                        'shap_value': round(shap_val, 4),
                        'feature_value': round(float(feature_val), 2),
                        'direction': 'increases' if shap_val > 0 else 'decreases',
                        'farmer_friendly': f"{friendly_name} {'increased' if shap_val > 0 else 'decreased'} stress risk by {abs(shap_val):.2%}"
                    })
                
                # Sort by absolute SHAP value (most important first)
                feature_importance.sort(key=lambda x: abs(x['shap_value']), reverse=True)
        except Exception as e:
            print(f"⚠️  SHAP calculation failed: {e}")
        
        return {
            'success': True,
            'prediction': prediction_text,
            'confidence': round(confidence, 2),
            'probabilities': {
                'Healthy': round(float(proba[0]) * 100, 2),
                'Moderate Stress': round(float(proba[1]) * 100, 2),
                'Severe Stress': round(float(proba[2]) * 100, 2)
            },
            'explanation': {
                'feature_importance': feature_importance,
                'top_factors': feature_importance[:3] if len(feature_importance) > 3 else feature_importance
            }
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

@app.get('/api/health')
def health():
    """Health check endpoint"""
    return {'status': 'ok', 'model_loaded': best_model is not None}

if __name__ == '__main__':
    print("\n" + "="*50)
    print("🌾 Crop Stress Classification API")
    print("="*50)
    print(f"📍 Server running at http://localhost:8001")
    print("="*50 + "\n")
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)
