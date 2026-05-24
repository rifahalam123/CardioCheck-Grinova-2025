"""
GRINOVA Heart Attack Risk Predictor — Flask Backend
Trained on the Framingham Heart Study dataset.
"""

import os
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

app = Flask(__name__)
CORS(app)

# ──────────────────────────────────────────────
# 1. Load & Prepare Data
# ──────────────────────────────────────────────
CSV_PATH = os.path.join(os.path.dirname(__file__), "framingham.csv")
df = pd.read_csv(CSV_PATH)

# Normalize text columns to numeric
if "Sex" in df.columns:
    df["Sex"] = df["Sex"].map({"male": 1, "Male": 1, "female": 0, "Female": 0})
if "currentSmoker" in df.columns:
    df["currentSmoker"] = df["currentSmoker"].map({"Yes": 1, "yes": 1, "No": 0, "no": 0, 1: 1, 0: 0})
if "diabetes" in df.columns:
    df["diabetes"] = df["diabetes"].map({"Yes": 1, "yes": 1, "No": 0, "no": 0, 1: 1, 0: 0})

# Convert all columns to numeric, coerce errors to NaN, then drop
for col in df.columns:
    df[col] = pd.to_numeric(df[col], errors="coerce")
df = df.dropna()

FEATURES = ["age", "Sex", "sysBP", "totChol", "glucose", "currentSmoker", "BMI"]
X = df[FEATURES]
y = df["TenYearCHD"]

# ──────────────────────────────────────────────
# 2. Train Model
# ──────────────────────────────────────────────
print("⏳ Training AI model …")
model = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42)
model.fit(X, y)

# Quick cross-val for model accuracy info
cv_scores = cross_val_score(model, X, y, cv=5, scoring="roc_auc")
model_auc = float(np.mean(cv_scores))
print(f"✅ Model trained — AUC: {model_auc:.3f}")

# Pre-compute population statistics for comparisons
pop_stats = {
    "age": {"mean": float(df["age"].mean()), "std": float(df["age"].std()), "min": float(df["age"].min()), "max": float(df["age"].max())},
    "sysBP": {"mean": float(df["sysBP"].mean()), "std": float(df["sysBP"].std()), "min": float(df["sysBP"].min()), "max": float(df["sysBP"].max())},
    "totChol": {"mean": float(df["totChol"].mean()), "std": float(df["totChol"].std()), "min": float(df["totChol"].min()), "max": float(df["totChol"].max())},
    "glucose": {"mean": float(df["glucose"].mean()), "std": float(df["glucose"].std()), "min": float(df["glucose"].min()), "max": float(df["glucose"].max())},
    "BMI": {"mean": float(df["BMI"].mean()), "std": float(df["BMI"].std()), "min": float(df["BMI"].min()), "max": float(df["BMI"].max())},
}

feature_importances = dict(zip(FEATURES, [float(x) for x in model.feature_importances_]))

# ──────────────────────────────────────────────
# 3. API Routes
# ──────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "model_auc": model_auc, "dataset_rows": len(df)})


@app.route("/api/stats", methods=["GET"])
def dataset_stats():
    """Return population-level stats & distributions."""
    risk_distribution = {
        "total": int(len(df)),
        "high_risk": int((df["TenYearCHD"] == 1).sum()),
        "low_risk": int((df["TenYearCHD"] == 0).sum()),
    }
    age_groups = pd.cut(df["age"], bins=[20, 35, 45, 55, 65, 100], labels=["20-35", "36-45", "46-55", "56-65", "65+"])
    age_risk = df.groupby(age_groups, observed=True)["TenYearCHD"].mean().to_dict()
    age_risk = {k: round(float(v) * 100, 1) for k, v in age_risk.items()}

    return jsonify({
        "population": pop_stats,
        "risk_distribution": risk_distribution,
        "age_risk_profile": age_risk,
        "feature_importances": feature_importances,
        "model_auc": model_auc,
    })


@app.route("/api/predict", methods=["POST"])
def predict():
    """Accept patient data, return risk prediction with insights."""
    data = request.get_json(force=True)

    age = float(data.get("age", 50))
    gender = data.get("gender", "Male")
    sys_bp = float(data.get("sysBP", 120))
    tot_chol = float(data.get("totChol", 200))
    glucose = float(data.get("glucose", 90))
    smoking = data.get("smoking", "No")
    bmi = float(data.get("bmi", 24.0))

    male_binary = 1 if gender == "Male" else 0
    smoker_binary = 1 if smoking == "Yes" else 0

    user_array = np.array([[age, male_binary, sys_bp, tot_chol, glucose, smoker_binary, bmi]])
    risk_prob = float(model.predict_proba(user_array)[0][1]) * 100

    # Risk category
    if risk_prob >= 30:
        category = "HIGH"
        emoji = "🔴"
        advice = "Please consult a cardiologist immediately. Your vitals indicate a significantly elevated risk."
    elif risk_prob >= 15:
        category = "MODERATE"
        emoji = "🟡"
        advice = "Consider lifestyle modifications. Monitor your blood pressure and cholesterol closely."
    else:
        category = "LOW"
        emoji = "🟢"
        advice = "No immediate high risk detected. Maintain your healthy habits!"

    # Per-feature contribution (how far from safe range)
    user_values = {
        "age": age, "sysBP": sys_bp, "totChol": tot_chol,
        "glucose": glucose, "BMI": bmi,
    }
    safe_ranges = {
        "age": (0, 45),
        "sysBP": (90, 120),
        "totChol": (125, 200),
        "glucose": (70, 100),
        "BMI": (18.5, 25.0),
    }
    risk_factors = []
    for feat, val in user_values.items():
        lo, hi = safe_ranges[feat]
        if val > hi:
            severity = min((val - hi) / (hi * 0.5), 1.0)  # 0-1 scale
            risk_factors.append({"factor": feat, "value": val, "safe_range": [lo, hi], "severity": round(severity, 2), "status": "elevated"})
        elif val < lo:
            severity = min((lo - val) / (lo * 0.5), 1.0)
            risk_factors.append({"factor": feat, "value": val, "safe_range": [lo, hi], "severity": round(severity, 2), "status": "low"})
        else:
            risk_factors.append({"factor": feat, "value": val, "safe_range": [lo, hi], "severity": 0.0, "status": "normal"})

    if smoker_binary:
        risk_factors.append({"factor": "Smoking", "value": "Yes", "safe_range": "No", "severity": 0.8, "status": "elevated"})

    # Smart health tips based on elevated factors
    tips = []
    if sys_bp > 120:
        tips.append({"icon": "🧂", "title": "Reduce Sodium Intake", "desc": "Limit salt to < 2300 mg/day. Opt for herbs and spices instead."})
        tips.append({"icon": "🏃", "title": "Regular Cardio Exercise", "desc": "Aim for 150 min/week of moderate-intensity exercise to lower BP."})
    if tot_chol > 200:
        tips.append({"icon": "🥑", "title": "Heart-Healthy Diet", "desc": "Increase fiber, omega-3 fatty acids. Reduce saturated fats."})
        tips.append({"icon": "💊", "title": "Cholesterol Check-up", "desc": "Discuss statin therapy with your doctor if lifestyle changes aren't enough."})
    if glucose > 100:
        tips.append({"icon": "🍬", "title": "Monitor Blood Sugar", "desc": "Reduce refined sugars. Consider getting tested for pre-diabetes."})
    if bmi > 25:
        tips.append({"icon": "⚖️", "title": "Weight Management", "desc": "A 5-10% weight reduction can significantly lower cardiovascular risk."})
    if smoker_binary:
        tips.append({"icon": "🚭", "title": "Quit Smoking", "desc": "Smoking doubles your heart attack risk. Seek cessation support."})
    if age > 55:
        tips.append({"icon": "🩺", "title": "Regular Screenings", "desc": "Annual cardiac check-ups become crucial after age 55."})
    if not tips:
        tips.append({"icon": "✅", "title": "Keep It Up!", "desc": "Your vitals look great. Continue maintaining a healthy lifestyle."})

    # Population comparison
    comparison = {}
    for feat in ["age", "sysBP", "totChol", "glucose", "BMI"]:
        val = user_values[feat]
        mean = pop_stats[feat]["mean"]
        std = pop_stats[feat]["std"]
        percentile = float(np.mean(df[feat].values <= val) * 100)
        comparison[feat] = {
            "user_value": val,
            "population_mean": round(mean, 1),
            "percentile": round(percentile, 1),
        }

    return jsonify({
        "risk_probability": round(risk_prob, 1),
        "category": category,
        "emoji": emoji,
        "advice": advice,
        "risk_factors": risk_factors,
        "health_tips": tips,
        "comparison": comparison,
        "feature_importances": feature_importances,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
