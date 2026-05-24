import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Cell, PieChart, Pie,
  RadialBarChart, RadialBar, Legend,
} from 'recharts'

/* ─── Constants ─── */
const NICE = {
  age: 'Age', Sex: 'Gender', sysBP: 'Blood Pressure', totChol: 'Cholesterol',
  glucose: 'Glucose', currentSmoker: 'Smoking', BMI: 'BMI', Smoking: 'Smoking',
}
const HST_KEY = 'grinova_history'
const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#3b82f6', '#818cf8', '#60a5fa']
const RISK_COLORS = { LOW: '#10b981', MODERATE: '#f59e0b', HIGH: '#ef4444' }

/* ─── Tiny Tooltip helper for form ─── */
const Tip = ({ t }) => (
  <span className="tt"><span className="tt__dot">?</span><span className="tt__msg">{t}</span></span>
)

/* ─── SVG Gauge ─── */
function Gauge({ value = 0, category = 'LOW' }) {
  const r = 80, circ = Math.PI * r
  const pct = Math.min(value, 100) / 100
  const col = RISK_COLORS[category] || RISK_COLORS.LOW
  return (
    <div className="gauge-wrap">
      <svg className="gauge-svg" viewBox="0 0 200 115">
        <path className="gauge-bg" d="M 20 100 A 80 80 0 0 1 180 100" />
        <path className="gauge-fill" d="M 20 100 A 80 80 0 0 1 180 100"
          style={{ stroke: col, strokeDasharray: circ, strokeDashoffset: circ * (1 - pct) }} />
        <text className="gauge-val" x="100" y="86">{value.toFixed(1)}%</text>
        <text className="gauge-lbl" x="100" y="108">Risk Score</text>
      </svg>
      <span className={`risk-chip risk-chip--${category.toLowerCase()}`}>
        {category === 'HIGH' ? '🔴' : category === 'MODERATE' ? '🟡' : '🟢'} {category} RISK
      </span>
    </div>
  )
}

/* ─── Custom Recharts Tooltip ─── */
const CTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
    }}>
      <div style={{ fontWeight: 700, color: '#f0f4f8', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#8896ab' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
export default function App() {
  const [form, setForm] = useState({
    age: 50, gender: 'Male', sysBP: 120, totChol: 200, glucose: 90, smoking: 'No', bmi: 24.0,
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HST_KEY)) || [] } catch { return [] }
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {}) }, [])
  useEffect(() => { localStorage.setItem(HST_KEY, JSON.stringify(history)) }, [history])

  const submit = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: form.age, gender: form.gender, sysBP: form.sysBP, totChol: form.totChol,
          glucose: form.glucose, smoking: form.smoking, bmi: form.bmi,
        }),
      })
      const data = await res.json()
      setResult(data)
      setHistory(prev => [{
        id: Date.now(), ts: new Date().toLocaleString(), risk: data.risk_probability,
        cat: data.category, inputs: { ...form },
      }, ...prev].slice(0, 20))
    } catch { setError('Cannot reach backend. Is the server running?') }
    finally { setLoading(false) }
  }, [form])

  /* ─── Derived chart data ─── */
  const importanceData = result?.feature_importances
    ? Object.entries(result.feature_importances)
        .map(([k, v]) => ({ name: NICE[k] || k, value: +(v * 100).toFixed(1) }))
        .sort((a, b) => b.value - a.value)
    : []

  const radarData = result?.comparison
    ? Object.entries(result.comparison).map(([k, c]) => ({
        factor: NICE[k] || k,
        user: c.percentile,
        avg: 50,
      }))
    : []

  const factorsBarData = result?.risk_factors
    ? result.risk_factors.map(f => ({
        name: NICE[f.factor] || f.factor,
        severity: +(f.severity * 100).toFixed(0),
        fill: f.severity > 0.6 ? RISK_COLORS.HIGH : f.severity > 0.2 ? RISK_COLORS.MODERATE : RISK_COLORS.LOW,
      }))
    : []

  const ageProfileData = stats?.age_risk_profile
    ? Object.entries(stats.age_risk_profile).map(([k, v]) => ({ age: k, risk: v }))
    : []

  const historyChartData = history.slice(0, 10).reverse().map((h, i) => ({
    name: `#${history.length - (history.slice(0, 10).length - 1 - i)}`,
    risk: h.risk,
    fill: RISK_COLORS[h.cat] || RISK_COLORS.LOW,
  }))

  const riskDonutData = result ? [
    { name: 'Risk', value: result.risk_probability, fill: RISK_COLORS[result.category] },
    { name: 'Safe', value: 100 - result.risk_probability, fill: 'rgba(255,255,255,0.04)' },
  ] : []

  /* ═══════════════════════════════════════
     RENDER
     ═══════════════════════════════════════ */
  return (
    <>
      {/* ─── TOP BAR ─── */}
      <nav className="topbar">
        <div className="topbar__brand">
          <div className="topbar__logo">❤</div>
          <div>
            <div className="topbar__name">GRINOVA</div>
            <div className="topbar__tagline">Heart Attack Risk Intelligence</div>
          </div>
        </div>
        <div className="topbar__right">
          {stats && (
            <>
              <div className="topbar__stat">
                <span className="topbar__stat-val">{stats.risk_distribution.total.toLocaleString()}</span>
                <span className="topbar__stat-lbl">Patients</span>
              </div>
              <div className="topbar__divider" />
              <div className="topbar__stat">
                <span className="topbar__stat-val">{(stats.model_auc * 100).toFixed(1)}%</span>
                <span className="topbar__stat-lbl">Model AUC</span>
              </div>
              <div className="topbar__divider" />
            </>
          )}
          <div className="topbar__status">
            <span className="topbar__status-dot" />
            Model Active
          </div>
        </div>
      </nav>

      <div className="dashboard">
        {/* ═══════════════ SIDEBAR ═══════════════ */}
        <aside className="sidebar">
          <div className="sidebar__title">
            <span className="sidebar__title-icon">🩺</span>
            Patient Assessment
          </div>

          {/* Age */}
          <div className="form-group">
            <div className="form-group__label">
              <span>Age <Tip t="Patient's age in years" /></span>
              <span className="form-group__value">{form.age}</span>
            </div>
            <input className="slider-input" type="range" min={20} max={100}
              value={form.age} onChange={e => set('age', +e.target.value)} />
          </div>

          {/* Gender */}
          <div className="form-group">
            <div className="form-group__label"><span>Gender <Tip t="Biological sex" /></span></div>
            <div className="radio-group">
              {['Male', 'Female'].map(g => (
                <div className="radio-option" key={g}>
                  <input type="radio" id={`g-${g}`} name="gender"
                    checked={form.gender === g} onChange={() => set('gender', g)} />
                  <label htmlFor={`g-${g}`}>{g === 'Male' ? '♂' : '♀'} {g}</label>
                </div>
              ))}
            </div>
          </div>

          {/* BP */}
          <div className="form-group">
            <div className="form-group__label">
              <span>Systolic BP <Tip t="Upper blood pressure (mmHg)" /></span>
              <span className="form-group__value">{form.sysBP}</span>
            </div>
            <input className="slider-input" type="range" min={80} max={230}
              value={form.sysBP} onChange={e => set('sysBP', +e.target.value)} />
          </div>

          {/* Cholesterol */}
          <div className="form-group">
            <div className="form-group__label"><span>Total Cholesterol <Tip t="Total cholesterol (mg/dL)" /></span></div>
            <input className="number-input" type="number" value={form.totChol}
              onChange={e => set('totChol', +e.target.value)} />
          </div>

          {/* Glucose */}
          <div className="form-group">
            <div className="form-group__label"><span>Fasting Glucose <Tip t="Blood sugar (mg/dL)" /></span></div>
            <input className="number-input" type="number" value={form.glucose}
              onChange={e => set('glucose', +e.target.value)} />
          </div>

          {/* Smoking */}
          <div className="form-group">
            <div className="form-group__label"><span>Smoking <Tip t="Current smoking status" /></span></div>
            <div className="radio-group">
              {['Yes', 'No'].map(s => (
                <div className="radio-option" key={s}>
                  <input type="radio" id={`s-${s}`} name="smoking"
                    checked={form.smoking === s} onChange={() => set('smoking', s)} />
                  <label htmlFor={`s-${s}`}>{s === 'Yes' ? '🚬' : '🚭'} {s}</label>
                </div>
              ))}
            </div>
          </div>

          {/* BMI */}
          <div className="form-group">
            <div className="form-group__label">
              <span>BMI <Tip t="Body Mass Index" /></span>
              <span className="form-group__value">{form.bmi.toFixed(1)}</span>
            </div>
            <input className="slider-input" type="range" min={10} max={50} step={0.1}
              value={form.bmi} onChange={e => set('bmi', +e.target.value)} />
          </div>

          <button id="assess-btn" className="submit-btn" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> Analyzing…</> : '⚡ Analyze Risk'}
          </button>
          {error && <div className="error-banner">{error}</div>}

          {/* ─── History ─── */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="sidebar__title" style={{ marginBottom: 0, fontSize: '0.82rem' }}>
                <span className="sidebar__title-icon" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>📋</span>
                History
              </div>
              {history.length > 0 && <button className="clear-btn" onClick={() => setHistory([])}>Clear</button>}
            </div>
            {history.length === 0
              ? <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.78rem' }}>No assessments yet</div>
              : history.slice(0, 4).map(h => (
                <div className="history-row" key={h.id}>
                  <div className="history-row__left">
                    <span className="history-row__date">{h.ts}</span>
                    <span className="history-row__risk" style={{ color: RISK_COLORS[h.cat] }}>{h.risk.toFixed(1)}%</span>
                  </div>
                  <span className="history-row__cat" style={{ color: RISK_COLORS[h.cat] }}>{h.cat}</span>
                </div>
              ))
            }
          </div>
        </aside>

        {/* ═══════════════ MAIN CONTENT ═══════════════ */}
        <main className="main-content">
          {!result ? (
            <div className="empty">
              <div className="empty__icon">🫀</div>
              <div className="empty__text">Enter patient vitals and click Analyze</div>
              <div className="empty__hint">Your personalized risk dashboard will appear here</div>

              {/* Show population insights even before prediction */}
              {ageProfileData.length > 0 && (
                <div style={{ width: '100%', maxWidth: 700, marginTop: 40 }}>
                  <div className="card fade-up">
                    <div className="card__header">
                      <div className="card__title">
                        <span className="card__icon card__icon--blue">📉</span>
                        CHD Risk by Age Group (Population)
                      </div>
                    </div>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ageProfileData} barSize={32}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="age" />
                          <YAxis unit="%" />
                          <Tooltip content={<CTooltip />} />
                          <Bar dataKey="risk" name="10-Year CHD Risk %" radius={[6, 6, 0, 0]}>
                            {ageProfileData.map((d, i) => (
                              <Cell key={i} fill={d.risk > 20 ? RISK_COLORS.HIGH : d.risk > 10 ? RISK_COLORS.MODERATE : RISK_COLORS.LOW} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ─── KPI ROW ─── */}
              <div className="kpi-row fade-up">
                <div className="kpi">
                  <div className="kpi__icon" style={{ background: `linear-gradient(135deg, ${RISK_COLORS[result.category]}33, ${RISK_COLORS[result.category]}15)` }}>
                    {result.emoji}
                  </div>
                  <div className="kpi__info">
                    <span className="kpi__value" style={{ color: RISK_COLORS[result.category] }}>{result.risk_probability.toFixed(1)}%</span>
                    <span className="kpi__label">Risk Score</span>
                    <span className="kpi__delta" style={{
                      background: result.category === 'LOW' ? 'var(--success-bg)' : result.category === 'MODERATE' ? 'var(--warning-bg)' : 'var(--danger-bg)',
                      color: RISK_COLORS[result.category],
                    }}>{result.category} RISK</span>
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi__icon" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.08))' }}>🫀</div>
                  <div className="kpi__info">
                    <span className="kpi__value">{form.sysBP}/{Math.round(form.sysBP * 0.65)}</span>
                    <span className="kpi__label">Blood Pressure</span>
                    <span className="kpi__delta" style={{
                      background: form.sysBP > 140 ? 'var(--danger-bg)' : form.sysBP > 120 ? 'var(--warning-bg)' : 'var(--success-bg)',
                      color: form.sysBP > 140 ? RISK_COLORS.HIGH : form.sysBP > 120 ? RISK_COLORS.MODERATE : RISK_COLORS.LOW,
                    }}>{form.sysBP > 140 ? 'High' : form.sysBP > 120 ? 'Elevated' : 'Normal'}</span>
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi__icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))' }}>🧪</div>
                  <div className="kpi__info">
                    <span className="kpi__value">{form.totChol}</span>
                    <span className="kpi__label">Cholesterol</span>
                    <span className="kpi__delta" style={{
                      background: form.totChol > 240 ? 'var(--danger-bg)' : form.totChol > 200 ? 'var(--warning-bg)' : 'var(--success-bg)',
                      color: form.totChol > 240 ? RISK_COLORS.HIGH : form.totChol > 200 ? RISK_COLORS.MODERATE : RISK_COLORS.LOW,
                    }}>{form.totChol > 240 ? 'High' : form.totChol > 200 ? 'Borderline' : 'Desirable'}</span>
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi__icon" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.08))' }}>⚖️</div>
                  <div className="kpi__info">
                    <span className="kpi__value">{form.bmi.toFixed(1)}</span>
                    <span className="kpi__label">BMI</span>
                    <span className="kpi__delta" style={{
                      background: form.bmi > 30 ? 'var(--danger-bg)' : form.bmi > 25 ? 'var(--warning-bg)' : 'var(--success-bg)',
                      color: form.bmi > 30 ? RISK_COLORS.HIGH : form.bmi > 25 ? RISK_COLORS.MODERATE : RISK_COLORS.LOW,
                    }}>{form.bmi > 30 ? 'Obese' : form.bmi > 25 ? 'Overweight' : 'Normal'}</span>
                  </div>
                </div>
              </div>

              {/* ─── ROW 1: Gauge + Risk Factors Bar ─── */}
              <div className="charts-row fade-up delay-1">
                <div className="card">
                  <div className="card__header">
                    <div className="card__title">
                      <span className="card__icon card__icon--purple">📊</span>
                      Risk Assessment
                    </div>
                  </div>
                  <Gauge value={result.risk_probability} category={result.category} />
                  <div className={`advice-box advice-box--${result.category.toLowerCase()}`}>{result.advice}</div>
                </div>

                <div className="card">
                  <div className="card__header">
                    <div className="card__title">
                      <span className="card__icon card__icon--amber">⚠️</span>
                      Risk Factors Severity
                    </div>
                  </div>
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={factorsBarData} layout="vertical" barSize={14}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} unit="%" />
                        <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11 }} />
                        <Tooltip content={<CTooltip />} />
                        <Bar dataKey="severity" name="Severity %" radius={[0, 6, 6, 0]}>
                          {factorsBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ─── ROW 2: Radar + Feature Importance ─── */}
              <div className="charts-row fade-up delay-2">
                <div className="card">
                  <div className="card__header">
                    <div className="card__title">
                      <span className="card__icon card__icon--blue">📈</span>
                      Patient vs Population (Radar)
                    </div>
                  </div>
                  <div className="chart-wrapper--tall" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} outerRadius="70%">
                        <PolarGrid stroke="rgba(255,255,255,0.06)" />
                        <PolarAngleAxis dataKey="factor" tick={{ fill: '#8896ab', fontSize: 11 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#5a6a80', fontSize: 10 }} />
                        <Radar name="Your Percentile" dataKey="user" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                        <Radar name="Population Avg" dataKey="avg" stroke="#3d4d63" fill="transparent" strokeDasharray="5 5" strokeWidth={1.5} />
                        <Tooltip content={<CTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card">
                  <div className="card__header">
                    <div className="card__title">
                      <span className="card__icon card__icon--green">🧠</span>
                      AI Feature Importance
                    </div>
                  </div>
                  <div className="chart-wrapper--tall" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={importanceData} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis unit="%" />
                        <Tooltip content={<CTooltip />} />
                        <Bar dataKey="value" name="Importance %" radius={[6, 6, 0, 0]}>
                          {importanceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ─── ROW 3: Risk Donut + Age Profile ─── */}
              <div className="charts-row fade-up delay-3">
                <div className="card">
                  <div className="card__header">
                    <div className="card__title">
                      <span className="card__icon card__icon--red">🎯</span>
                      Risk Breakdown
                    </div>
                  </div>
                  <div className="chart-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={riskDonutData} cx="50%" cy="50%" innerRadius={60} outerRadius={85}
                          dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                          {riskDonutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Pie>
                        <text x="50%" y="46%" textAnchor="middle" fill="#f0f4f8" fontSize="1.6rem" fontWeight="800" fontFamily="Inter">
                          {result.risk_probability.toFixed(1)}%
                        </text>
                        <text x="50%" y="58%" textAnchor="middle" fill="#5a6a80" fontSize="0.6rem" fontFamily="Inter" textTransform="uppercase" letterSpacing="1">
                          10-Year CHD
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {ageProfileData.length > 0 && (
                  <div className="card">
                    <div className="card__header">
                      <div className="card__title">
                        <span className="card__icon card__icon--blue">📉</span>
                        CHD Risk by Age Group
                      </div>
                    </div>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ageProfileData}>
                          <defs>
                            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="age" />
                          <YAxis unit="%" />
                          <Tooltip content={<CTooltip />} />
                          <Area type="monotone" dataKey="risk" name="Risk %" stroke="#6366f1" fill="url(#riskGrad)" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* ─── ROW 4: Assessment History Chart ─── */}
              {historyChartData.length > 1 && (
                <div className="charts-row fade-up delay-4" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="card">
                    <div className="card__header">
                      <div className="card__title">
                        <span className="card__icon card__icon--purple">📋</span>
                        Assessment History Trend
                      </div>
                    </div>
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={historyChartData}>
                          <defs>
                            <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis unit="%" domain={[0, 100]} />
                          <Tooltip content={<CTooltip />} />
                          <Area type="monotone" dataKey="risk" name="Risk %" stroke="#8b5cf6" fill="url(#histGrad)" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Health Tips ─── */}
              <div className="card fade-up delay-4" style={{ marginTop: 0 }}>
                <div className="card__header">
                  <div className="card__title">
                    <span className="card__icon card__icon--green">💡</span>
                    Personalized Recommendations
                  </div>
                </div>
                <div className="tips-grid">
                  {result.health_tips?.map((t, i) => (
                    <div className="tip" key={i}>
                      <div className="tip__icon">{t.icon}</div>
                      <div className="tip__title">{t.title}</div>
                      <div className="tip__desc">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <footer className="footer">
            GRINOVA — AI Heart Risk Detector · Built by Team 404 ·{' '}
            <a href="https://www.framinghamheartstudy.org/" target="_blank" rel="noreferrer">Framingham Heart Study</a>
            <br />
            <span style={{ fontSize: '0.62rem' }}>⚠️ For educational purposes only. Not a substitute for professional medical advice.</span>
          </footer>
        </main>
      </div>
    </>
  )
}
