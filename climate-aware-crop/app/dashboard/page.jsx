'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useRouter } from 'next/navigation'

export default function FarmerInputDashboard() {
  const { user } = useAuth()
  const router = useRouter()

  // State management
  const [formData, setFormData] = useState({
    season: 'Summer',
    crop_type: 'Rice',
    temperature: '',
    rainfall: '',
    soil_moisture: '',
    pest_damage: ''
  })

  const [loading, setLoading] = useState(false)
  const [prediction, setPrediction] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cropPredictionHistory')
    if (saved) {
      try {
        setHistory(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load history:', e)
      }
    }
  }, [])

  // Generate recommendations based on input values
  const generateRecommendations = (data) => {
    const recommendations = []

    // Pest Damage checks
    if (data.pest_damage > 50) {
      recommendations.push({
        priority: 'Critical',
        message: `High pest damage detected (${data.pest_damage}%) - Apply pesticide immediately`,
        icon: '🐛'
      })
    } else if (data.pest_damage > 25) {
      recommendations.push({
        priority: 'High',
        message: `Moderate pest damage (${data.pest_damage}%) - Monitor closely and consider treatment`,
        icon: '🐛'
      })
    }

    // Soil Moisture checks
    if (data.soil_moisture < 20) {
      recommendations.push({
        priority: 'Critical',
        message: `Very low soil moisture (${data.soil_moisture}%) - Increase irrigation immediately`,
        icon: '💧'
      })
    } else if (data.soil_moisture < 40) {
      recommendations.push({
        priority: 'High',
        message: `Low soil moisture (${data.soil_moisture}%) - Plan irrigation soon`,
        icon: '💧'
      })
    }

    // Temperature checks
    if (data.temperature > 45) {
      recommendations.push({
        priority: 'High',
        message: `High temperature (${data.temperature}°C) - Provide shade/cooling measures`,
        icon: '🌡️'
      })
    } else if (data.temperature < -10) {
      recommendations.push({
        priority: 'High',
        message: `Very low temperature (${data.temperature}°C) - Protect crops from frost`,
        icon: '❄️'
      })
    }

    // Rainfall checks
    if (data.rainfall > 300 && data.season === 'Monsoon') {
      recommendations.push({
        priority: 'High',
        message: `High rainfall (${data.rainfall}mm) - Ensure proper drainage`,
        icon: '🌧️'
      })
    } else if (data.rainfall < 10 && data.season === 'Summer') {
      recommendations.push({
        priority: 'Medium',
        message: `Low rainfall (${data.rainfall}mm) - Plan supplementary irrigation`,
        icon: '☀️'
      })
    }

    // General seasonal recommendations
    if (data.season === 'Monsoon' && data.soil_moisture > 80) {
      recommendations.push({
        priority: 'Medium',
        message: 'Very high moisture during monsoon - Watch for waterlogging',
        icon: '💦'
      })
    }

    return recommendations.length > 0 ? recommendations : []
  }

  // Circular Gauge Component
  const CircularGauge = ({ percentage, stressLevel }) => {
    const getColor = () => {
      if (percentage < 33) return '#10b981' // Green
      if (percentage < 66) return '#f59e0b' // Yellow
      return '#ef4444' // Red
    }

    const circumference = 2 * Math.PI * 90
    const offset = circumference - (percentage / 100) * circumference

    return (
      <div className="flex flex-col items-center">
        <svg width="220" height="220" className="transform -rotate-90">
          {/* Background circle */}
          <circle cx="110" cy="110" r="90" fill="none" stroke="#e5e7eb" strokeWidth="12" />
          {/* Progress circle */}
          <circle
            cx="110"
            cy="110"
            r="90"
            fill="none"
            stroke={getColor()}
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'all 0.3s ease' }}
          />
        </svg>
        <div className="absolute text-center mt-0">
          <p className="text-4xl font-bold text-gray-900">{percentage}%</p>
          <p className="text-lg font-semibold text-gray-600">{stressLevel}</p>
        </div>
      </div>
    )
  }

  // Validation rules - MUST BE BEFORE validateField
  const validation = {
    temperature: { min: -50, max: 60, unit: '°C' },
    rainfall: { min: 0, max: 500, unit: 'mm' },
    soil_moisture: { min: 0, max: 100, unit: '%' },
    pest_damage: { min: 0, max: 100, unit: '%' }
  }

  // Validate input
  const validateField = (name, value) => {
    if (!value && value !== 0) return ''
    const numValue = parseFloat(value)
    const rule = validation[name]
    if (!rule) return ''
    
    if (numValue < rule.min || numValue > rule.max) {
      return `Must be between ${rule.min} and ${rule.max} ${rule.unit}`
    }
    return ''
  }

  // Handle form input change
  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError(null)
  }

  // Submit form and call ML API
  const handlePredict = async (e) => {
    e.preventDefault()
    setError(null)
    setPrediction(null)

    // Validate all fields
    for (const [key, val] of Object.entries(formData)) {
      if (key !== 'season' && key !== 'crop_type') {
        if (!val) {
          setError('All numerical fields are required')
          return
        }
        const validationError = validateField(key, val)
        if (validationError) {
          setError(`${key}: ${validationError}`)
          return
        }
      }
    }

    setLoading(true)

    try {
      // Call ML API
      const response = await fetch('http://localhost:8001/api/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          season: formData.season,
          crop_type: formData.crop_type,
          temperature: parseFloat(formData.temperature),
          rainfall: parseFloat(formData.rainfall),
          soil_moisture: parseFloat(formData.soil_moisture),
          pest_damage: parseFloat(formData.pest_damage)
        })
      })

      if (!response.ok) {
        throw new Error('ML service not responding on port 8001. Make sure to start it with: node start-ml.js')
      }

      const data = await response.json()

      if (data.success) {
        // Calculate stress percentage from probabilities
        let stressPercentage = 0
        if (data.probabilities) {
          // Stress = Moderate Stress * 0.5 + Severe Stress * 1.0
          const moderateStress = parseFloat(data.probabilities['Moderate Stress']) || 0
          const severeStress = parseFloat(data.probabilities['Severe Stress']) || 0
          stressPercentage = (moderateStress * 50 + severeStress * 100) / 100
        }

        const newPrediction = {
          prediction: data.prediction,
          confidence: data.confidence,
          probabilities: data.probabilities,
          stressPercentage: Math.round(stressPercentage),
          timestamp: new Date().toISOString(),
          formData: { ...formData },
          explanation: data.explanation || null
        }

        setPrediction(newPrediction)

        // Save to history (keep last 10)
        const updatedHistory = [newPrediction, ...history].slice(0, 10)
        setHistory(updatedHistory)
        localStorage.setItem('cropPredictionHistory', JSON.stringify(updatedHistory))
      } else {
        setError(data.error || 'Prediction failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    router.push('/login')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        
        {/* PAGE HEADER */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Crop Stress Prediction
          </h1>
          <p className="text-gray-600 text-sm">
            Enter crop and weather data to predict stress levels
          </p>
        </header>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">
              <span className="font-semibold">❌ Error:</span> {error}
            </p>
          </div>
        )}

        {/* MAIN FORM CARD */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Input Field Parameters
            </h2>

            <form onSubmit={handlePredict} className="space-y-6">
              
              {/* ROW 1: Season & Crop Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Season */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Season <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="season"
                    value={formData.season}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Summer">🌞 Summer</option>
                    <option value="Winter">❄️ Winter</option>
                    <option value="Monsoon">🌧️ Monsoon</option>
                  </select>
                </div>

                {/* Crop Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Crop Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="crop_type"
                    value={formData.crop_type}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Rice">Rice</option>
                    <option value="Wheat">Wheat</option>
                  </select>
                </div>
              </div>

              {/* ROW 2: Temperature & Rainfall */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Temperature */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temperature <span className="text-red-500">*</span>
                    <span className="text-gray-500 font-normal"> (-50°C to 60°C)</span>
                  </label>
                  <input
                    type="number"
                    name="temperature"
                    value={formData.temperature}
                    onChange={handleFormChange}
                    placeholder="e.g., 25"
                    step="0.1"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Rainfall */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rainfall <span className="text-red-500">*</span>
                    <span className="text-gray-500 font-normal"> (0-500 mm)</span>
                  </label>
                  <input
                    type="number"
                    name="rainfall"
                    value={formData.rainfall}
                    onChange={handleFormChange}
                    placeholder="e.g., 20"
                    step="0.1"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* ROW 3: Soil Moisture & Pest Damage */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Soil Moisture */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Soil Moisture <span className="text-red-500">*</span>
                    <span className="text-gray-500 font-normal"> (0-100%)</span>
                  </label>
                  <input
                    type="number"
                    name="soil_moisture"
                    value={formData.soil_moisture}
                    onChange={handleFormChange}
                    placeholder="e.g., 40"
                    step="0.1"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Pest Damage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pest Damage <span className="text-red-500">*</span>
                    <span className="text-gray-500 font-normal"> (0-100%)</span>
                  </label>
                  <input
                    type="number"
                    name="pest_damage"
                    value={formData.pest_damage}
                    onChange={handleFormChange}
                    placeholder="e.g., 20"
                    step="0.1"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 ${
                    loading
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Predicting...
                    </>
                  ) : (
                    <>
                      🔮 Predict Stress Level
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* PREDICTION RESULT CARD */}
        {prediction && (
          <div className="mt-8 space-y-6">
            
            {/* CIRCULAR GAUGE - RISK METER */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
                🎯 Crop Stress Risk Meter
              </h3>
              <div className="flex justify-center mb-4">
                <div className="relative w-64 h-64">
                  <CircularGauge 
                    percentage={prediction.stressPercentage} 
                    stressLevel={prediction.prediction}
                  />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Confidence Score</p>
                <p className="text-2xl font-bold text-blue-600">{(prediction.confidence * 100).toFixed(1)}%</p>
              </div>
            </div>

            {/* RECOMMENDATIONS SECTION */}
            {generateRecommendations(prediction.formData).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  💡 Recommendations
                </h3>
                <div className="space-y-3">
                  {generateRecommendations(prediction.formData).map((rec, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border-l-4 ${
                        rec.priority === 'Critical'
                          ? 'bg-red-50 border-red-400'
                          : rec.priority === 'High'
                          ? 'bg-yellow-50 border-yellow-400'
                          : 'bg-blue-50 border-blue-400'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl mt-1">{rec.icon}</span>
                        <div className="flex-1">
                          <p className={`font-semibold text-sm ${
                            rec.priority === 'Critical'
                              ? 'text-red-900'
                              : rec.priority === 'High'
                              ? 'text-yellow-900'
                              : 'text-blue-900'
                          }`}>
                            {rec.priority} Priority
                          </p>
                          <p className={`text-sm mt-1 ${
                            rec.priority === 'Critical'
                              ? 'text-red-800'
                              : rec.priority === 'High'
                              ? 'text-yellow-800'
                              : 'text-blue-800'
                          }`}>
                            {rec.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PROBABILITY BREAKDOWN */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                📊 Probability Breakdown
              </h3>
              <div className="space-y-4">
                {prediction.probabilities && Object.entries(prediction.probabilities).map(([label, prob]) => (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      <span className="text-sm font-bold text-gray-900">{prob}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${
                          label === 'Healthy' ? 'bg-green-500' :
                          label === 'Moderate Stress' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${prob}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SHAP FEATURE IMPORTANCE - WATERFALL EXPLANATION */}
            {prediction.explanation && prediction.explanation.feature_importance && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  🔍 Why This Prediction? (SHAP Analysis)
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Here's what influenced the crop stress prediction:
                </p>
                
                {/* Top 3 Most Important Factors */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">🎯 Top Factors (Most Important):</h4>
                  <div className="space-y-3">
                    {prediction.explanation.top_factors && prediction.explanation.top_factors.map((factor, idx) => {
                      const isPositive = factor.shap_value > 0
                      const barLength = Math.abs(factor.shap_value) * 100
                      
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {idx + 1}. {factor.friendly_name}
                              </p>
                              <p className="text-xs text-gray-600">
                                {factor.farmer_friendly}
                              </p>
                              <p className="text-xs text-blue-600 font-mono">
                                SHAP value: {isPositive ? '+' : ''}{factor.shap_value.toFixed(4)}
                              </p>
                            </div>
                          </div>
                          {/* Waterfall bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 flex items-center">
                              <div
                                className={`h-2 rounded-full ${
                                  isPositive ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${Math.min(barLength, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold w-12 text-right">
                              {Math.abs(factor.shap_value).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* All Features Detailed View */}
                <details className="mt-4 pt-4 border-t border-gray-200">
                  <summary className="cursor-pointer font-semibold text-sm text-gray-700 hover:text-gray-900">
                    📋 View All {prediction.explanation.feature_importance.length} Features
                  </summary>
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {prediction.explanation.feature_importance.map((factor, idx) => {
                      const isPositive = factor.shap_value > 0
                      return (
                        <div key={idx} className="p-2 bg-gray-50 rounded text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-gray-700">{factor.friendly_name}</span>
                            <span className={`font-bold ${isPositive ? 'text-red-600' : 'text-blue-600'}`}>
                              {isPositive ? '+' : ''}{factor.shap_value.toFixed(4)}
                            </span>
                          </div>
                          <p className="text-gray-600">{factor.farmer_friendly}</p>
                        </div>
                      )
                    })}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {/* PREDICTION HISTORY TIMELINE */}
        {history.length > 0 && (
          <div className="mt-8 bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              📈 Prediction History (Last {history.length})
            </h3>
            <div className="space-y-2">
              {history.map((pred, idx) => {
                const date = new Date(pred.timestamp)
                const timeStr = date.toLocaleString()
                const getHistoryColor = (level) => {
                  if (level === 'Healthy') return 'bg-green-100 text-green-800 border-green-300'
                  if (level === 'Moderate Stress') return 'bg-yellow-100 text-yellow-800 border-yellow-300'
                  return 'bg-red-100 text-red-800 border-red-300'
                }

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border flex items-center justify-between ${getHistoryColor(pred.prediction)}`}
                  >
                    <div>
                      <p className="font-semibold text-sm">{pred.prediction}</p>
                      <p className="text-xs opacity-75">{timeStr}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{pred.stressPercentage}%</p>
                      <p className="text-xs opacity-75">{(pred.confidence * 100).toFixed(0)}% confidence</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* INFO CARD */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            💡 How to use this form:
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Select the current season and crop type</li>
            <li>✓ Enter weather and field conditions within the valid ranges</li>
            <li>✓ Click "Predict Stress Level" to get the AI prediction</li>
            <li>✓ The ML model will return: Healthy, Moderate Stress, or Severe Stress</li>
          </ul>
        </div>

        {/* DEBUG: Show form data being sent */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 bg-gray-100 border border-gray-300 rounded-lg p-4">
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-semibold mb-2">Debug: Form Data</summary>
              <pre className="overflow-auto">{JSON.stringify(formData, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

