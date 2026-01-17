'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { saveCropCycle, validateCropData } from '../services/cropService'
import { detectSeason, getCropTypes, getSoilTypes, getSeasons } from '../utils/seasonHelper'
import { getWeatherData } from '../services/weatherService'
import styles from './dashboard-enhanced.module.css'

export default function EnhancedDashboard() {
  const { user } = useAuth()
  const [cropData, setCropData] = useState({
    crop_type: '',
    soil_type: '',
    sowing_date: '',
    season: '',
    location: {
      village: '',
      lat: '',
      lng: '',
    },
  })
  const [seasonSource, setSeasonSource] = useState('auto')
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [stressLevel, setStressLevel] = useState(null)
  const [weatherData, setWeatherData] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Auto-detect season when sowing date changes
  useEffect(() => {
    if (cropData.sowing_date && seasonSource === 'auto') {
      const detectedSeason = detectSeason(cropData.sowing_date)
      if (detectedSeason) {
        setCropData(prev => ({
          ...prev,
          season: detectedSeason,
        }))
      }
    }
  }, [cropData.sowing_date, seasonSource])

  const handleInputChange = (e) => {
    const { name, value } = e.target

    if (name.startsWith('location_')) {
      const fieldName = name.replace('location_', '')
      setCropData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          [fieldName]: value,
        },
      }))
    } else {
      setCropData(prev => ({
        ...prev,
        [name]: value,
      }))
    }
  }

  const handleSeasonChange = (e) => {
    setCropData(prev => ({
      ...prev,
      season: e.target.value,
    }))
    setSeasonSource('farmer')
  }

  const calculateStressLevel = async () => {
    // Validate first
    const validation = validateCropData(cropData)
    if (!validation.isValid) {
      setErrors(validation.errors)
      setStressLevel(null)
      return
    }

    setErrors([])
    setWeatherLoading(true)

    try {
      // Get weather data based on location
      const lat = parseFloat(cropData.location.lat) || 20.5937 // Default to India center
      const lng = parseFloat(cropData.location.lng) || 78.9629

      const weather = await getWeatherData(lat, lng)
      setWeatherData(weather)

      // Calculate stress level based on multiple factors
      const stressScore = evaluateStress(cropData, weather)
      setStressLevel(stressScore)

      // Save crop data to Firestore
      await saveCropCycle({
        ...cropData,
        userId: user.uid,
        season_source: seasonSource,
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (error) {
      console.error('Error calculating stress:', error)
      setErrors(['Failed to evaluate stress. Please try again.'])
    } finally {
      setWeatherLoading(false)
    }
  }

  const evaluateStress = (crop, weather) => {
    let stressScore = 0
    const factors = []

    // Soil-based stress
    if (crop.soil_type === 'Sandy') {
      stressScore += 20
      factors.push('Sandy soil: High water drainage - May cause drought stress')
    } else if (crop.soil_type === 'Clay') {
      stressScore += 15
      factors.push('Clay soil: Poor drainage - Risk of waterlogging')
    } else {
      stressScore += 5
      factors.push('Loamy soil: Good drainage - Optimal for most crops')
    }

    // Temperature-based stress
    if (weather.temp > 35) {
      stressScore += 25
      factors.push(`High temperature (${weather.temp}°C): Heat stress risk`)
    } else if (weather.temp < 10) {
      stressScore += 20
      factors.push(`Low temperature (${weather.temp}°C): Cold stress risk`)
    } else {
      factors.push(`Temperature (${weather.temp}°C): Normal`)
    }

    // Humidity-based stress
    if (weather.humidity < 30) {
      stressScore += 20
      factors.push(`Low humidity (${weather.humidity}%): High evaporation`)
    } else if (weather.humidity > 90) {
      stressScore += 15
      factors.push(`High humidity (${weather.humidity}%): Disease risk`)
    } else {
      factors.push(`Humidity (${weather.humidity}%): Good`)
    }

    // Rain-based stress
    if (weather.rainfall > 100) {
      stressScore += 15
      factors.push('Heavy rainfall: Waterlogging risk')
    } else if (weather.rainfall === 0 && crop.season !== 'Winter') {
      stressScore += 15
      factors.push('No rainfall: Drought risk')
    }

    // Season-based stress (if out of optimal season)
    const cropSeasonMap = {
      'Rice': ['Monsoon'],
      'Wheat': ['Winter'],
      'Corn': ['Summer', 'Monsoon'],
      'Sugarcane': ['Winter', 'Summer'],
      'Cotton': ['Summer', 'Monsoon'],
    }

    if (cropSeasonMap[crop.crop_type]?.includes(crop.season)) {
      factors.push(`${crop.crop_type} in ${crop.season}: Optimal season`)
    } else if (cropSeasonMap[crop.crop_type]) {
      stressScore += 10
      factors.push(`${crop.crop_type} in ${crop.season}: Off-season growing`)
    }

    return {
      score: Math.min(stressScore, 100),
      level: getStressLevel(stressScore),
      factors,
    }
  }

  const getStressLevel = (score) => {
    if (score <= 20) return 'Low'
    if (score <= 40) return 'Moderate'
    if (score <= 60) return 'High'
    return 'Critical'
  }

  const getStressColor = (level) => {
    switch (level) {
      case 'Low': return '#10b981'
      case 'Moderate': return '#f59e0b'
      case 'High': return '#ef4444'
      case 'Critical': return '#7c3aed'
      default: return '#6b7280'
    }
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1>🌾 Farm Dashboard</h1>
        <p>Welcome, {user?.email}</p>
      </div>

      <div className={styles.container}>
        {/* Input Section */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>📋 Enter Crop Details</h2>

          {errors.length > 0 && (
            <div className={styles.errorBox}>
              {errors.map((err, idx) => (
                <p key={idx}>❌ {err}</p>
              ))}
            </div>
          )}

          {success && (
            <div className={styles.successBox}>
              ✅ Crop details saved! Stress level calculated.
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Crop Type</label>
              <select name="crop_type" value={cropData.crop_type} onChange={handleInputChange} className={styles.input}>
                <option value="">Select crop</option>
                {getCropTypes().map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Soil Type</label>
              <select name="soil_type" value={cropData.soil_type} onChange={handleInputChange} className={styles.input}>
                <option value="">Select soil</option>
                {getSoilTypes().map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Sowing Date</label>
              <input type="date" name="sowing_date" value={cropData.sowing_date} onChange={handleInputChange} className={styles.input} />
            </div>

            <div className={styles.formGroup}>
              <label>Season {seasonSource === 'auto' && <span className={styles.auto}>(auto)</span>}</label>
              <select name="season" value={cropData.season} onChange={handleSeasonChange} className={styles.input}>
                <option value="">Select season</option>
                {getSeasons().map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Village / Location</label>
              <input type="text" name="location_village" placeholder="Your area" value={cropData.location.village} onChange={handleInputChange} className={styles.input} />
            </div>

            <div className={styles.formGroup}>
              <label>Latitude (Optional)</label>
              <input type="number" step="0.0001" name="location_lat" placeholder="19.1136" value={cropData.location.lat} onChange={handleInputChange} className={styles.input} />
            </div>

            <div className={styles.formGroup}>
              <label>Longitude (Optional)</label>
              <input type="number" step="0.0001" name="location_lng" placeholder="73.5142" value={cropData.location.lng} onChange={handleInputChange} className={styles.input} />
            </div>
          </div>

          <button onClick={calculateStressLevel} disabled={loading || weatherLoading} className={styles.calculateBtn}>
            {loading || weatherLoading ? '⏳ Calculating...' : '📊 Evaluate Stress Level'}
          </button>
        </div>

        {/* Stress Level Display */}
        {stressLevel && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>🌡️ Stress Level Assessment</h2>

            <div className={styles.stressContainer}>
              <div className={styles.stressCircle} style={{ borderColor: getStressColor(stressLevel.level) }}>
                <div className={styles.stressScore} style={{ color: getStressColor(stressLevel.level) }}>
                  {stressLevel.score}%
                </div>
                <div className={styles.stressLevelText} style={{ color: getStressColor(stressLevel.level) }}>
                  {stressLevel.level}
                </div>
              </div>

              <div className={styles.stressFactors}>
                <h3>Contributing Factors:</h3>
                <ul>
                  {stressLevel.factors.map((factor, idx) => (
                    <li key={idx}>{factor}</li>
                  ))}
                </ul>
              </div>
            </div>

            {weatherData && (
              <div className={styles.weatherBox}>
                <h3>Current Weather</h3>
                <p>🌡️ Temperature: {weatherData.temp}°C</p>
                <p>💧 Humidity: {weatherData.humidity}%</p>
                <p>🌧️ Rainfall: {weatherData.rainfall}mm</p>
                <p>💨 Wind: {weatherData.windSpeed} km/h</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
