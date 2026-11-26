import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './experience.css'
import './authentication.css'
import './repositories.css'
import './activity-intelligence.css'
import './pull-requests.css'
import { activity, languages, repositories as sampleRepositories } from './data/demo'
import { useAuth } from './context/useAuth'
import { useGithubRepositories } from './context/useGithubRepositories'
import { useCommitIntelligence } from './context/useCommitIntelligence'
import { useLanguageIntelligence } from './context/useLanguageIntelligence'
import { useContributorIntelligence } from './context/useContributorIntelligence'
import { usePullRequestDetails, usePullRequestList } from './context/usePullRequestIntelligence'
import { useCodeReviews } from './context/useCodeReviews'
import { filterPullRequests, formatPullRequestDate, getPullRequestStatus } from './utils/pull-request-intelligence'
import { useActivityComparison } from './context/useActivityComparison'
import { getSafeAuthError } from './services/auth-errors'
import { ACTIVITY_PERIODS, alignActivityWindow, compareActivityPeriods, getLatestActivityWindow } from './utils/activity-intelligence'
import { readPageFromSearch, resolveNavigationTarget, resolveVisiblePage, searchWithPage, WORKSPACE_PAGES, readCodeReviewSelection, saveCodeReviewSelection } from './utils/workspace-navigation'

const paths = {
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  repo: <><path d="M4 4.8A1.8 1.8 0 0 1 5.8 3H20v17H5.8A1.8 1.8 0 0 1 4 18.2V4.8Z"/><path d="M4 17.5c0-1 .8-1.8 1.8-1.8H20M8 7h8M8 10h5"/></>,
  review: <><path d="M8 3h8l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3Z"/><path d="M15 3v5h5M8 13h8M8 17h5"/><path d="m8 9 1 1 2-2"/></>,
  chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  github: <><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.7A5.2 5.2 0 0 0 18.8 5a4.8 4.8 0 0 0-.1-3S17.5 1.7 15 3.4a13.2 13.2 0 0 0-7 0C5.5 1.7 4.3 2 4.3 2A4.8 4.8 0 0 0 4.2 5 5.2 5.2 0 0 0 2.8 8.7c0 5.2 3.1 6.4 6.1 6.7A3.4 3.4 0 0 0 8 18v4"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
  code: <><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12"/></>,
  bolt: <path d="m13 2-3 9h7l-6 11 2-9H6l7-11Z"/>,
}

function Icon({ name, size = 18, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>
}

function Brand({ onClick, compact = false }) {
  return <button className={`brand ${compact ? 'brand-compact' : ''}`} onClick={onClick} aria-label="NEBULITH home"><span className="brand-mark"><i/><b/></span><span>NEBULITH</span></button>
}

function Button({ children, kind = 'primary', onClick, className = '', type = 'button', disabled = false }) {
  return <button type={type} className={`button button-${kind} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>
}

function getWorkspaceSessionStorage() {
  try { return window.sessionStorage } catch { return null }
}

function ShootingStars() {
  const [meteor, setMeteor] = useState(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let startTimer
    let finishTimer
    let active = true
    let sequence = 0

    const scheduleNext = () => {
      startTimer = window.setTimeout(() => {
        if (!active) return

        const duration = 850 + Math.round(Math.random() * 650)
        const trajectory = Math.floor(Math.random() * 3)
        setMeteor({
          id: sequence++,
          duration,
          trajectory,
          left: 67 + Math.random() * 27,
          top: 7 + Math.random() * 46,
          trail: 72 + Math.random() * 86,
          brightness: 0.42 + Math.random() * 0.42,
        })

        finishTimer = window.setTimeout(() => {
          if (!active) return
          setMeteor(null)
          scheduleNext()
        }, duration + 1700 + Math.random() * 3300)
      }, 4300 + Math.random() * 6800)
    }

    scheduleNext()
    return () => {
      active = false
      window.clearTimeout(startTimer)
      window.clearTimeout(finishTimer)
    }
  }, [])

  if (!meteor) return null

  return <span
    key={meteor.id}
    className={`shooting-star shooting-star-${meteor.trajectory}`}
    aria-hidden="true"
    style={{
      left: `${meteor.left}%`,
      top: `${meteor.top}%`,
      '--comet-duration': `${meteor.duration}ms`,
      '--comet-trail': `${meteor.trail}px`,
      '--comet-brightness': meteor.brightness,
    }}
  />
}

const pageNames = ['Overview', 'Repositories', 'Code Reviews', 'Analytics', 'Settings']
const pageIcons = ['grid', 'repo', 'review', 'chart', 'settings']

function Landing({ navigate }) {
  const { status } = useAuth()
  const isAuthenticated = status === 'authenticated'
  const moveScene = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 18
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 18
    event.currentTarget.style.setProperty('--scene-x', `${x.toFixed(1)}px`)
    event.currentTarget.style.setProperty('--scene-y', `${y.toFixed(1)}px`)
  }

  return <div className="cinematic-page">
    <header className="cinematic-nav wrap">
      <Brand onClick={() => navigate('landing')}/>
      <nav aria-label="Main navigation"><a href="#features">Features</a><a href="#platform">Platform</a><a href="#about">About</a></nav>
      <div className="cinematic-nav-actions"><button className="text-link" onClick={() => navigate(isAuthenticated ? 'overview' : 'login')}>{isAuthenticated ? 'Workspace' : 'Sign in'}</button><Button onClick={() => navigate(isAuthenticated ? 'overview' : 'register')}>{isAuthenticated ? 'Open workspace' : 'Get started'} <Icon name="arrow" size={14}/></Button></div>
    </header>
    <main>
      <section className="cinematic-hero" onPointerMove={moveScene} onPointerLeave={(event) => { event.currentTarget.style.setProperty('--scene-x', '0px'); event.currentTarget.style.setProperty('--scene-y', '0px') }}>
        <div className="space-stars stars-near"/><div className="space-stars stars-far"/><div className="nebula-cloud nebula-blue"/><div className="nebula-cloud nebula-violet"/><div className="nebula-cloud nebula-magenta"/>
        <ShootingStars/>
        <div className="hero-planet" aria-hidden="true"><div className="planet-ring planet-ring-back"/><div className="planet-surface"/><div className="planet-ring planet-ring-front"/></div>
        <div className="hero-vignette"/>
        <div className="cinematic-hero-content wrap">
          <div className="cinematic-kicker hero-enter hero-delay-1"><span className="kicker-line"/> A NEW PERSPECTIVE ON YOUR CODE <span className="kicker-index">001 / 007</span></div>
          <h1 className="cinematic-title hero-enter hero-delay-2">BEYOND<br/>THE <span>CODE.</span></h1>
          <div className="cinematic-subtitle hero-enter hero-delay-3">Your code. Your universe.</div>
          <p className="cinematic-description hero-enter hero-delay-4">An intelligent workspace to understand your repositories, improve your code and explore your development journey.</p>
          <div className="cinematic-actions hero-enter hero-delay-5"><Button onClick={() => navigate('overview')}>Explore Workspace <Icon name="arrow" size={16}/></Button><a className="cinematic-secondary" href="#introduction">Discover NEBULITH <span>↓</span></a></div>
        </div>
        <div className="hero-edge-note"><span>INTELLIGENCE FOR WHAT YOU BUILD</span><span>SCROLL TO EXPLORE <i>↓</i></span></div>
        <div className="hero-coordinate">21° 17′ 38.9″ N &nbsp; 72° 49′ 15.4″ E</div>
      </section>
      <section id="introduction" className="cinematic-intro cinematic-section">
        <span id="platform" className="cinematic-anchor" aria-hidden="true"/>
        <div className="section-orbit-mark" aria-hidden="true"><i/><b/></div>
        <div className="cinematic-section-inner wrap"><span className="section-index">01 — THE BIGGER PICTURE</span><h2>A universe of work.<br/><span>One clear view.</span></h2><p>Every repository holds a story. NEBULITH brings the signals together so you can see what’s moving, what needs attention, and where your team can go next.</p><a className="section-continue" href="#repositories"><span>EXPLORE THE PLATFORM</span><Icon name="arrow" size={15}/></a></div>
      </section>
      <section id="repositories" className="cinematic-feature feature-repositories cinematic-section">
        <span id="features" className="cinematic-anchor" aria-hidden="true"/>
        <div className="feature-ambient ambient-blue"/><div className="feature-layout wrap"><div className="feature-copy"><span className="section-index">02 — REPOSITORY INTELLIGENCE</span><h2>Know your<br/><span>codebase.</span></h2><p>See the shape of your engineering world at a glance. Understand repository health, activity, ownership, and the quiet patterns that are easy to miss.</p><a className="text-cta" href="#reviews">A clearer picture of every project <Icon name="arrow" size={15}/></a></div><div className="repo-orbit-visual"><div className="visual-grid"/><div className="repo-orbit orbit-a"/><div className="repo-orbit orbit-b"/><div className="repo-core"><Icon name="repo" size={24}/><span>WORKSPACE</span></div><div className="repo-node node-one"><span className="node-icon"><Icon name="code" size={15}/></span><span><b>nebula-core</b><small>HEALTH <i/> 96</small></span></div><div className="repo-node node-two"><span className="node-icon violet-node"><Icon name="repo" size={15}/></span><span><b>orbit-ui</b><small>UPDATED 2H AGO</small></span></div><div className="repo-node node-three"><span className="node-icon blue-node"><Icon name="chart" size={15}/></span><span><b>signal-api</b><small>ACTIVITY <i/> RISING</small></span></div><div className="repo-visual-note">24 REPOSITORIES <i/> 06 LANGUAGES</div></div></div>
      </section>
      <section id="reviews" className="cinematic-feature feature-reviews cinematic-section"><div className="feature-ambient ambient-violet"/><div className="feature-layout feature-reverse wrap"><div className="review-orbit-visual"><div className="review-halo"/><div className="review-code-card"><div className="review-code-top"><span><i/><i/><i/></span><small>auth/session.ts</small><span className="diff-label">+1 −1</span></div><div className="review-code"><span>41</span> <i>const</i> session = await store.get();<br/><span>42</span> <b>− if (session.expired) return null;</b><br/><span>43</span> <em>+ if (!session || session.expired) return null;</em><br/><span>44</span> return refresh(session);</div><div className="review-insight"><span className="review-spark"><Icon name="spark" size={17}/></span><span><b>One small safeguard.</b><small>Catch the missing session before reading its properties.</small></span><span className="review-severity">LOW RISK</span></div></div><div className="review-orbit-label"><Icon name="review" size={14}/> A BETTER SECOND LOOK</div></div><div className="feature-copy"><span className="section-index">03 — INTELLIGENT CODE REVIEWS</span><h2>Clarity at<br/><span>every change.</span></h2><p>Make review time count. Bring useful context and thoughtful signals closer to each pull request, without adding more noise to the process.</p><a className="text-cta" href="#analytics">See what matters in the diff <Icon name="arrow" size={15}/></a></div></div>
      </section>
      <section id="analytics" className="cinematic-feature feature-analytics cinematic-section"><div className="feature-ambient ambient-magenta"/><div className="feature-layout wrap"><div className="feature-copy"><span className="section-index">04 — DEVELOPER ANALYTICS</span><h2>Find the<br/><span>momentum.</span></h2><p>Look beyond activity counts. Follow contribution patterns, review flow, and team focus over time—with context that helps you decide what to do next.</p><a className="text-cta" href="#preview">Follow your team’s signal <Icon name="arrow" size={15}/></a></div><div className="analytics-orbit-visual"><div className="analytics-chart-header"><span>CONTRIBUTION PULSE</span><span><i/> LAST 7 DAYS</span></div><div className="analytics-chart-grid"><i/><i/><i/><i/></div><svg viewBox="0 0 620 300" preserveAspectRatio="none" role="img" aria-label="Illustrative contribution activity over seven days"><defs><linearGradient id="landingChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9d88ff" stopOpacity=".3"/><stop offset="1" stopColor="#6d7de8" stopOpacity="0"/></linearGradient></defs><path className="analytics-chart-fill" d="M0 244 C48 228 64 224 92 231 S145 190 183 206 228 185 265 197 307 143 345 166 396 136 428 148 466 105 502 117 559 79 620 42 V300 H0Z" fill="url(#landingChartFill)"/><path className="analytics-chart-line" d="M0 244 C48 228 64 224 92 231 S145 190 183 206 228 185 265 197 307 143 345 166 396 136 428 148 466 105 502 117 559 79 620 42" fill="none" stroke="#b4a1ff" strokeWidth="2.2"/><circle cx="502" cy="117" r="5" fill="#e0d8ff"/></svg><div className="analytics-chart-labels"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div><div className="analytics-stat-float"><span>REVIEW FLOW</span><b>+18.4<small>%</small></b><i>↑ HEALTHY MOMENTUM</i></div></div></div>
      </section>
      <section id="preview" className="cinematic-preview cinematic-section"><div className="preview-light"/><div className="wrap preview-inner"><div className="preview-intro"><span className="section-index">05 — YOUR WORKSPACE</span><h2>Perspective,<br/><span>put to work.</span></h2><p>A calm, connected home for your repositories, reviews, and the bigger picture.</p></div><div className="dashboard-showcase"><div className="showcase-topbar"><Brand compact onClick={() => navigate('landing')}/><span>WORKSPACE / OVERVIEW</span><div className="showcase-user">MC</div></div><div className="showcase-layout"><div className="showcase-side"><div className="showcase-side-active"><Icon name="grid" size={14}/> Overview</div><span><Icon name="repo" size={14}/> Repositories</span><span><Icon name="review" size={14}/> Code reviews</span><span><Icon name="chart" size={14}/> Analytics</span></div><div className="showcase-main"><div className="showcase-title"><div><small>MONDAY, NOVEMBER 24</small><h3>Good morning, Maya <span>✦</span></h3></div><span className="showcase-status"><i/> GITHUB CONNECTED</span></div><div className="showcase-stats"><div><small>Repositories</small><b>24 <i>+3</i></b></div><div><small>Open reviews</small><b>08</b></div><div><small>Review health</small><b>96.8<span>%</span></b></div></div><div className="showcase-lower"><div className="showcase-mini-chart"><div><b>Engineering pulse</b><span>THIS WEEK</span></div><svg viewBox="0 0 500 115" preserveAspectRatio="none" aria-hidden="true"><path d="M0 92 C45 82 70 88 102 74 S145 91 181 66 218 77 250 54 291 67 327 43 362 51 397 31 449 43 500 12" fill="none" stroke="#a393ff" strokeWidth="2.5"/><path d="M0 92 C45 82 70 88 102 74 S145 91 181 66 218 77 250 54 291 67 327 43 362 51 397 31 449 43 500 12V115H0Z" fill="url(#landingChartFill)"/></svg></div><div className="showcase-health"><span>WORKSPACE HEALTH</span><strong>96.8</strong><small>All systems trending well</small><div><i/></div></div></div></div></div><div className="showcase-caption"><span><i/> VISUAL PREVIEW · SAMPLE DATA</span><span>Built for a clearer view.</span></div></div></div></section>
      <section id="about" className="cinematic-final cinematic-section"><div className="final-nebula"/><div className="final-copy wrap"><span className="section-index">06 — YOUR NEXT CHAPTER</span><h2>See where<br/>you can <span>go.</span></h2><p>Bring your repositories into focus. There’s a universe in what you’re building.</p><Button onClick={() => navigate('register')}>Explore Workspace <Icon name="arrow" size={16}/></Button></div></section>
    </main>
    <footer className="cinematic-footer wrap"><Brand onClick={() => navigate('landing')} compact/><span>Thoughtful engineering, in a new light.</span><nav aria-label="Footer navigation"><a href="#introduction">Platform</a><button onClick={() => navigate('login')}>Sign in</button></nav><span className="footer-copyright">© 2026 NEBULITH</span></footer>
  </div>
}

function AuthPage({ mode, navigate }) {
  const { login, register, authMessage } = useAuth()
  const isLogin = mode === 'login'
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [requestError, setRequestError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitLock = useRef(false)

  const updateField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setRequestError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitLock.current) return

    const errors = {}
    if (!isLogin && !values.name.trim()) errors.name = 'Enter your name.'
    else if (!isLogin && values.name.trim().length > 100) errors.name = 'Name must be 100 characters or fewer.'

    const email = values.email.trim()
    if (!email) errors.email = 'Enter your email address.'
    else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'

    if (!values.password) errors.password = 'Enter your password.'
    else if (new TextEncoder().encode(values.password).length > 72) errors.password = 'Password must be 72 UTF-8 bytes or fewer.'
    else if (!isLogin && [...values.password].length < 8) errors.password = 'Password must be at least 8 characters.'

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    submitLock.current = true
    setIsSubmitting(true)
    setRequestError('')
    try {
      const credentials = isLogin
        ? { email, password: values.password }
        : { name: values.name.trim(), email, password: values.password }
      if (isLogin) await login(credentials)
      else await register(credentials)
      navigate('overview')
    } catch (error) {
      setRequestError(getSafeAuthError(error))
    } finally {
      submitLock.current = false
      setIsSubmitting(false)
    }
  }

  const inputError = (field) => fieldErrors[field]
    ? <span className="auth-field-error" id={`${field}-error`}>{fieldErrors[field]}</span>
    : null

  return <main className="auth-page cosmic-bg"><button className="auth-back" onClick={() => navigate('landing')}>← <span>Back to NEBULITH</span></button><div className="auth-stars"/><div className="auth-card"><Brand onClick={() => navigate('landing')}/><div className="auth-heading"><span className="eyebrow">YOUR WORKSPACE AWAITS</span><h1>{isLogin ? 'Welcome back.' : 'Begin your orbit.'}</h1><p>{isLogin ? 'Sign in to see the bigger picture.' : 'Create an account and bring your code into focus.'}</p></div>
    <form onSubmit={submit} className="auth-form" noValidate aria-busy={isSubmitting}>
      {!isLogin && <label htmlFor="auth-name">Name<input id="auth-name" name="name" type="text" placeholder="Maya Chen" autoComplete="name" value={values.name} onChange={(event) => updateField('name', event.target.value)} disabled={isSubmitting} aria-invalid={Boolean(inputError('name'))} aria-describedby={inputError('name') ? 'name-error' : undefined}/>{inputError('name')}</label>}
      {isLogin && authMessage && <div className="auth-error" role="status">{authMessage}</div>}
      <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" placeholder="you@company.com" autoComplete="email" value={values.email} onChange={(event) => updateField('email', event.target.value)} disabled={isSubmitting} aria-invalid={Boolean(inputError('email'))} aria-describedby={inputError('email') ? 'email-error' : undefined}/>{inputError('email')}</label>
      <label htmlFor="auth-password">Password<input id="auth-password" name="password" type="password" placeholder={isLogin ? 'Your password' : 'At least 8 characters'} autoComplete={isLogin ? 'current-password' : 'new-password'} value={values.password} onChange={(event) => updateField('password', event.target.value)} disabled={isSubmitting} aria-invalid={Boolean(inputError('password'))} aria-describedby={inputError('password') ? 'password-error' : (!isLogin ? 'password-hint' : undefined)}/>{inputError('password')}{!isLogin&&<span className="auth-field-hint" id="password-hint">8 characters minimum · 72 UTF-8 bytes maximum</span>}</label>
      {requestError && <div className="auth-error" role="alert"><Icon name="spark" size={15}/><span>{requestError}</span></div>}
      <Button type="submit" className="auth-submit" disabled={isSubmitting}>{isSubmitting ? <><span className="auth-spinner" aria-hidden="true"/> {isLogin ? 'Signing in…' : 'Creating account…'}</> : <>{isLogin ? 'Sign in' : 'Create account'} <Icon name="arrow" size={15}/></>}</Button>
    </form>
    <p className="auth-switch">{isLogin ? 'New to NEBULITH?' : 'Already have an account?'} <button onClick={() => navigate(isLogin ? 'register' : 'login')} disabled={isSubmitting}>{isLogin ? 'Create an account' : 'Sign in'}</button></p><div className="auth-privacy"><Icon name="lock" size={13}/> Your session is scoped to this browser tab.</div></div><div className="auth-footer">A clearer view of the work you do. <span>© 2026 NEBULITH</span></div></main>
}

function AuthLoadingScreen() {
  return <main className="auth-page cosmic-bg"><div className="auth-stars"/><section className="auth-card auth-status-card" role="status" aria-live="polite"><Brand onClick={() => {}}/><span className="auth-spinner auth-spinner-large" aria-hidden="true"/><h1>Restoring your workspace</h1><p>Checking your sign-in with NEBULITH.</p></section></main>
}

function SessionRecovery({ message, retrySession, onSignIn, isChecking }) {
  return <main className="auth-page cosmic-bg"><div className="auth-stars"/><section className="auth-card auth-status-card"><Brand onClick={onSignIn}/><span className="recovery-icon"><Icon name="spark" size={20}/></span><span className="eyebrow">SESSION CHECK</span><h1>We can’t reach your workspace.</h1><p role="alert">{message}</p><Button onClick={retrySession} disabled={isChecking}>{isChecking ? <><span className="auth-spinner"/> Checking…</> : 'Try again'}</Button><button className="recovery-signin" onClick={onSignIn}>Continue to sign in</button></section></main>
}

function AppShell({ page, navigate, children, user, onLogout, storageWarning, repositoryStatus, repositoryError }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const go = (target) => { navigate(target); setMobileOpen(false) }
  const displayName = user?.name || user?.email || 'Developer'
  const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'N'
  const githubStatus = repositoryStatus === 'success'
    ? 'Connected'
    : repositoryError?.code === 'GITHUB_NOT_CONNECTED'
      ? 'Not connected'
      : repositoryStatus === 'loading'
        ? 'Checking…'
        : 'Unavailable'
  return <div className="workspace-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Brand compact onClick={() => go('landing')}/><button className="mobile-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><Icon name="close"/></button></div><div className="workspace-switch"><span className="workspace-glyph">N</span><span><b>Northstar Studio</b><small>Free workspace</small></span><span className="switch-chevron">⌄</span></div><div className="side-label">WORKSPACE</div><nav className="side-nav" aria-label="Workspace navigation">{pageNames.map((name,i)=><button key={name} onClick={() => go(name.toLowerCase().replace(' ', '-'))} className={`side-link ${page === name.toLowerCase().replace(' ', '-') ? 'active' : ''}`}><Icon name={pageIcons[i]}/><span>{name}</span>{name==='Code Reviews'&&<i className="nav-count">3</i>}</button>)}</nav><div className="sidebar-spacer"/><div className="side-label">CONNECTED</div><div className="connection-card"><span className="connection-github"><Icon name="github" size={17}/></span><span><b>GitHub</b><small className={`github-link-status ${repositoryStatus === 'success' ? 'is-connected' : ''}`}><i/>{githubStatus}</small></span><span className="connection-dots">···</span></div><button className="sidebar-help" onClick={() => navigate('landing')}><span className="help-mark">?</span><span><b>Need a hand?</b><small>Visit the help center</small></span><Icon name="chevron" size={14}/></button><button className="profile-row" onClick={() => go('settings')}><span className="profile-avatar">{initials}</span><span><b>{displayName}</b><small>{user?.email}</small></span><Icon name="more" size={18}/></button><button className="logout-button" onClick={onLogout}>Sign out</button></aside>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
    <div className="workspace-main"><header className="workspace-topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu"/></button><div className="breadcrumbs"><span>Northstar Studio</span><Icon name="chevron" size={13}/><b>{pageNames.find((n) => n.toLowerCase().replace(' ', '-') === page) || 'Overview'}</b></div><div className="topbar-actions"><span className="demo-badge" title="Repository, commit activity, contributor and language data are live; code review and productivity previews are sample data."><i/> LIVE + SAMPLE</span><button className="icon-button" aria-label="Notifications"><Icon name="bell"/></button><button className="topbar-avatar" onClick={() => go('settings')}>{initials}</button></div></header>{storageWarning&&<div className="storage-warning" role="status">{storageWarning}</div>}<main className="workspace-content">{children}</main><footer className="workspace-footer"><span>NEBULITH <i>·</i> A clearer view of your codebase</span><span>Repository data live · Insights sample</span></footer></div>
  </div>
}

function PageHeader({ eyebrow, title, detail, action, className = '' }) {
  return <div className={`page-header ${className}`}><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1>{detail&&<p>{detail}</p>}</div>{action}</div>
}

function Overview({ navigate, openRepo, user, repositories: liveRepositories, repositoryStatus, repositoryError, retryRepositories, selectedCommitRepository, onSelectCommitRepository, commitIntelligence, languageIntelligence, contributorIntelligence }) {
  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email || 'there'
  const stats = useMemo(() => liveRepositories.reduce((total, repo) => ({
    total: total.total + 1,
    public: total.public + (repo.visibility === 'public' ? 1 : 0),
    private: total.private + (repo.visibility === 'private' ? 1 : 0),
    stars: total.stars + (Number.isFinite(repo.stars) ? repo.stars : 0),
    forks: total.forks + (Number.isFinite(repo.forks) ? repo.forks : 0),
  }), { total: 0, public: 0, private: 0, stars: 0, forks: 0 }), [liveRepositories])
  const connected = repositoryStatus === 'success'
  const [activityBuckets, setActivityBuckets] = useState(13)
  const [comparisonIds, setComparisonIds] = useState([])
  const comparisonRepositories = useMemo(() => liveRepositories.filter((repository) => comparisonIds.includes(String(repository.id)) && String(repository.id) !== String(selectedCommitRepository?.id)).slice(0, 3), [liveRepositories, comparisonIds, selectedCommitRepository?.id])
  const activityComparison = useActivityComparison(connected && Boolean(selectedCommitRepository), comparisonRepositories)
  const isLoading = repositoryStatus === 'loading'
  const disconnected = repositoryError?.code === 'GITHUB_NOT_CONNECTED'
  const connectionTitle = connected
    ? 'GitHub repository access is active'
    : isLoading
      ? 'Loading your GitHub repositories'
      : disconnected
        ? 'GitHub is not connected'
        : 'GitHub repository access is unavailable'
  const connectionMessage = connected
    ? 'Repository, commit activity, contributor and language data are live. Code review and productivity previews remain sample data.'
    : isLoading
      ? 'Fetching repository data from your linked GitHub App installation.'
      : disconnected
        ? 'Connect your GitHub account with an installed NEBULITH App to load repositories.'
        : 'Repository data could not be verified. Retry to check the linked GitHub App.'
  const statValue = (value) => repositoryStatus === 'success' ? value : '—'
  const statNote = repositoryStatus === 'success' ? 'Live GitHub data' : repositoryStatus === 'loading' ? 'Loading GitHub data…' : 'Unavailable'
  return <>
    <PageHeader className="overview-page-header" eyebrow="YOUR WORKSPACE" title={`Good morning, ${firstName}`} detail="A live view of your repositories, alongside clearly marked workspace previews." action={<Button kind="secondary" onClick={() => navigate('repositories')}><Icon name="github" size={16}/> View repositories</Button>}/>
    <div className={`connection-banner ${connected ? 'repository-connected' : !isLoading ? 'repository-disconnected' : ''}`}><div className="connected-mark"><Icon name="github" size={18}/></div><div><b>{connectionTitle}</b><span>{connectionMessage}</span></div><span className="connected-status"><i/>{connected ? ' Live' : isLoading ? ' Loading' : ' Check'}</span>{!connected&&!isLoading&&<button className="banner-arrow" onClick={retryRepositories} aria-label="Retry GitHub repository connection"><Icon name="arrow" size={16}/></button>}</div>
    <div className="stat-grid repository-stat-grid"><StatCard label="Repositories" value={statValue(stats.total)} delta={statNote} icon="repo" tone="cyan"/><StatCard label="Public" value={statValue(stats.public)} delta="Live GitHub data" icon="globe" tone="green"/><StatCard label="Private" value={statValue(stats.private)} delta="Live GitHub data" icon="lock" tone="violet"/><StatCard label="Stars" value={statValue(stats.stars)} delta="Live GitHub data" icon="spark" tone="amber"/><StatCard label="Forks" value={statValue(stats.forks)} delta="Live GitHub data" icon="repo" tone="cyan"/></div>
    <ActivityIntelligencePanel repositories={liveRepositories} repositoryStatus={repositoryStatus} retryRepositories={retryRepositories} selectedRepository={selectedCommitRepository} onSelectRepository={onSelectCommitRepository} intelligence={commitIntelligence} period={activityBuckets} onPeriodChange={setActivityBuckets} comparisonRepositories={comparisonRepositories} comparison={activityComparison} comparisonIds={comparisonIds} onComparisonIdsChange={setComparisonIds}/>
    <LanguageIntelligencePanel intelligence={languageIntelligence}/>
    <div className="dashboard-grid overview-lower-grid"><section className="panel repositories-panel"><div className="panel-heading"><div><h2>Your repositories</h2><p>{repositoryStatus === 'success' ? 'Live GitHub App data · select a repository for details.' : 'Live GitHub App repositories'}</p></div><button className="panel-link" onClick={() => navigate('repositories')}>All repositories <Icon name="arrow" size={14}/></button></div>{repositoryStatus === 'success' && liveRepositories.length > 0 ? <div className="overview-repo-grid">{liveRepositories.slice(0,4).map((repo)=><OverviewRepoCard key={repo.id} repo={repo} openRepo={openRepo}/>)}</div> : <RepositoryFeedback status={repositoryStatus} error={repositoryError} retry={retryRepositories} empty={repositoryStatus === 'success'}/>}</section><RecentRepositoryActivity intelligence={commitIntelligence} repositoryName={selectedCommitRepository?.fullName}/></div>
    <CommitIntelligencePanel repositories={liveRepositories} repositoryStatus={repositoryStatus} repositoryError={repositoryError} retryRepositories={retryRepositories} selectedRepository={selectedCommitRepository} onSelectRepository={onSelectCommitRepository} intelligence={commitIntelligence}/>
    <ContributorIntelligencePanel repositories={liveRepositories} repositoryStatus={repositoryStatus} selectedRepository={selectedCommitRepository} onSelectRepository={onSelectCommitRepository} intelligence={contributorIntelligence} commitIntelligence={commitIntelligence}/>
    <div className="dashboard-grid overview-insights-grid"><section className="panel code-summary-panel"><div className="panel-heading"><div><h2>Code review overview</h2><p>Sample pull request signals</p></div><button className="panel-link" onClick={() => navigate('code-reviews')}>Review queue <Icon name="arrow" size={14}/></button></div><div className="review-summary-meter"><div className="review-summary-ring"><strong>08</strong><span>OPEN</span></div><div className="review-summary-copy"><b>Moving at a healthy pace</b><span>3 ready · 3 in review · 2 need attention</span><div className="review-summary-bar"><i/></div></div></div><div className="review-summary-list"><span><i className="review-dot violet"/> In review <b>03</b></span><span><i className="review-dot green"/> Ready to merge <b>03</b></span><span><i className="review-dot amber"/> Needs attention <b>02</b></span></div></section><section className="panel productivity-panel"><div className="productivity-heading"><span className="productivity-icon"><Icon name="bolt" size={18}/></span><span className="section-index">TEAM MOMENTUM · SAMPLE</span></div><p>A little less waiting.<br/><strong>A little more making.</strong></p><div className="productivity-metrics"><div><span>AVG. REVIEW TIME</span><b>4.2h</b></div><div><span>WEEKLY MOMENTUM</span><b>+18%</b></div></div><div className="productivity-sparkline" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></section></div>
    <div className="demo-disclaimer"><Icon name="spark" size={14}/> Repository metadata, commit history, weekly activity, contributor accounts and language analytics above use live GitHub data. Code review and productivity previews remain sample data.</div>
  </>
}

function activityDate(timestamp, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })
}

function activityWindowLabel(window) {
  if (window?.status !== 'ready') return ''
  return `${activityDate(window.startWeek)} – ${activityDate(window.endWeek)}`
}

function includesCurrentActivityWeek(window) {
  if (window?.status !== 'ready') return false
  const sunday = new Date()
  sunday.setUTCHours(0, 0, 0, 0)
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay())
  const currentWeekStart = Math.floor(sunday.getTime() / 1000)
  return window.weeks.some((week) => week.week === currentWeekStart)
}

function ActivityIntelligencePanel({ repositories, repositoryStatus, retryRepositories, selectedRepository, onSelectRepository, intelligence, period, onPeriodChange, comparisonRepositories, comparison, comparisonIds, onComparisonIdsChange }) {
  const window = getLatestActivityWindow(intelligence.weeks, period)
  const periodComparison = compareActivityPeriods(intelligence.weeks, period)
  const selectedId = String(selectedRepository?.id ?? '')
  const statusMessage = {
    loading: 'Loading weekly GitHub activity…',
    computing: 'GitHub is preparing these statistics. Retry in a moment.',
    unavailable: 'GitHub has no activity statistics available for this repository yet.',
    error: intelligence.activityError?.message || 'Weekly activity could not be loaded.',
  }
  const comparisonMax = Math.max(window.status === 'ready' ? window.total : 0, ...comparisonRepositories.map((repo) => {
    const result = comparison.results[String(repo.id ?? repo.fullName)]
    return window.status === 'ready' && result?.status === 'ready'
      ? alignActivityWindow(result.weeks, window.weeks).total || 0
      : 0
  }), 1)

  return <section className="panel activity-intelligence-panel">
    <div className="panel-heading"><div><span className="section-index">LIVE GITHUB STATISTICS</span><h2>Engineering pulse</h2><p>Weekly commits from GitHub · each point is one Sunday–Saturday bucket.</p></div><div className="activity-controls">
      {repositories.length > 0 && <label><span>Repository</span><select value={selectedId} onChange={(event) => onSelectRepository(repositories.find((repo) => String(repo.id) === event.target.value)?.id)} aria-label="Repository for Engineering pulse">{repositories.map((repo) => <option key={repo.id} value={String(repo.id)}>{repo.fullName}</option>)}</select></label>}
      <label><span>Period</span><select value={period} onChange={(event) => onPeriodChange(Number(event.target.value))} aria-label="Engineering pulse period">{ACTIVITY_PERIODS.map((item) => <option value={item.buckets} key={item.buckets}>{item.label}</option>)}</select></label>
    </div></div>
    {!selectedRepository ? <div className="activity-message">{repositoryStatus === 'loading' ? 'Loading connected repositories…' : repositoryStatus === 'success' ? 'Connect or select a repository to view commit activity.' : 'GitHub repository access is unavailable.'}{repositoryStatus !== 'success' && repositoryStatus !== 'loading' && <button className="quiet-button" onClick={retryRepositories}>Retry</button>}</div>
      : intelligence.activityStatus === 'ready' && window.status === 'ready' ? <>
        <div className="activity-period-summary"><div><small>{selectedRepository.fullName} · {activityWindowLabel(window)}</small><strong>{window.total.toLocaleString()} <span>commits</span></strong>{includesCurrentActivityWeek(window) && <small>The latest GitHub week is in progress, so its count may be partial.</small>}</div><div className="activity-period-compare" aria-live="polite">
          {periodComparison.status === 'ready' ? <><span>Previous equivalent period · {activityWindowLabel(periodComparison.previous)}</span><b>{periodComparison.current.total.toLocaleString()} vs {periodComparison.previous.total.toLocaleString()} commits</b><small>{periodComparison.difference > 0 ? '+' : ''}{periodComparison.difference.toLocaleString()} commits{periodComparison.percentageChange === null ? ' · percentage unavailable (previous period was zero)' : ` · ${periodComparison.percentageChange > 0 ? '+' : ''}${periodComparison.percentageChange.toFixed(1)}%`}</small></> : <span>{periodComparison.status === 'insufficient' ? 'Previous equivalent period is outside GitHub’s available history.' : 'A continuous previous period is not available; comparison omitted.'}</span>}
        </div></div>
        <WeeklyActivityChart weeks={window.weeks} label={`${selectedRepository.fullName} weekly commits, ${activityWindowLabel(window)}`}/>
      </> : intelligence.activityStatus === 'ready' && window.status === 'insufficient' ? <div className="activity-message">GitHub returned {intelligence.weeks.length} weekly buckets; {period} continuous buckets are needed for this view.</div>
        : intelligence.activityStatus === 'ready' ? <div className="activity-message">The returned GitHub weeks have gaps, so this period cannot be shown as a continuous chart.</div>
          : <div className="activity-message" role={intelligence.activityStatus === 'error' ? 'alert' : 'status'}>{statusMessage[intelligence.activityStatus] || 'Activity data is not available.'}{['error', 'computing'].includes(intelligence.activityStatus) && <button className="quiet-button" onClick={intelligence.retryActivity}>{intelligence.activityStatus === 'error' ? 'Retry' : 'Check again'}</button>}</div>}
    <div className="activity-comparison">
      <div className="panel-heading"><div><h3>Repository comparison</h3><p>Same {period} weekly buckets and exact GitHub week timestamps as the selected repository.</p></div></div>
      {repositories.filter((repo) => String(repo.id) !== selectedId).length > 0 ? <div className="activity-repo-options">{repositories.filter((repo) => String(repo.id) !== selectedId).map((repo) => <label key={repo.id}><input type="checkbox" checked={comparisonIds.includes(String(repo.id))} disabled={!comparisonIds.includes(String(repo.id)) && comparisonIds.length >= 3} onChange={(event) => onComparisonIdsChange((current) => event.target.checked ? [...current, String(repo.id)] : current.filter((id) => id !== String(repo.id)))}/><span>{repo.fullName}</span></label>)}</div> : <p className="activity-message">Connect more repositories to compare activity.</p>}
      {comparisonRepositories.map((repo) => {
        const key = String(repo.id ?? repo.fullName)
        const result = comparison.results[key] || { status: 'loading', weeks: [] }
        const aligned = window.status === 'ready' && result.status === 'ready' ? alignActivityWindow(result.weeks, window.weeks) : null
        const stateText = result.status === 'loading' ? 'Loading…' : result.status === 'computing' ? 'GitHub is computing statistics' : result.status === 'unavailable' ? 'Statistics unavailable' : result.status === 'error' ? (result.error?.message || 'Could not load activity') : window.status !== 'ready' ? 'Waiting for a complete primary period' : aligned?.status === 'ready' ? `${aligned.total.toLocaleString()} commits` : `Incomplete coverage (${aligned?.availableBuckets || 0}/${period} buckets)`
        return <div className="activity-comparison-row" key={key}><b>{repo.fullName}</b><span>{stateText}</span>{result.status === 'error' || result.status === 'computing' ? <button className="quiet-button" onClick={() => comparison.retry(key)}>{result.status === 'error' ? 'Retry' : 'Check again'}</button> : aligned?.status === 'ready' && <i title={`${aligned.total} commits in same weekly buckets`}><span style={{ width: `${Math.max(2, Math.min(100, (aligned.total / comparisonMax) * 100))}%` }}/></i>}</div>
      })}
    </div>
  </section>
}

function WeeklyActivityChart({ weeks, label }) {
  const max = Math.max(...weeks.map((week) => week.total), 1)
  const width = 720
  const height = 180
  const step = width / weeks.length
  return <div className="live-weekly-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <line x1="0" y1="160" x2={width} y2="160" className="activity-axis"/>
    {weeks.map((week, index) => {
      const barWidth = Math.max(3, step * 0.52)
      const barHeight = week.total === 0 ? 2 : Math.max(3, (week.total / max) * 140)
      const x = index * step + (step - barWidth) / 2
      const y = 160 - barHeight
      return <g key={week.week} tabIndex="0" role="img" aria-label={`${activityDate(week.week, { month: 'long', day: 'numeric', year: 'numeric' })}: ${week.total} commits`}>
        <rect x={x} y={y} width={barWidth} height={barHeight} rx="2" className="live-activity-bar"/><title>{`${activityDate(week.week, { month: 'long', day: 'numeric', year: 'numeric' })} week · ${week.total} commits`}</title>
      </g>
    })}
  </svg><div className="live-chart-dates"><span>{activityDate(weeks[0].week)}</span><span>{activityDate(weeks[weeks.length - 1].week)}</span></div></div>
}

function OverviewRepoCard({ repo, openRepo }) {
  return <button className="overview-repo-card" onClick={() => openRepo(repo)} aria-label={`Open details for ${repo.fullName}`}>
    <div className="overview-repo-top"><span className="repo-symbol"><Icon name="repo" size={15}/></span><RepositoryVisibility visibility={repo.visibility}/></div>
    <b>{repo.name}</b><small className="repository-full-name">{repo.fullName}</small><p>{repo.description || 'No description provided.'}</p>
    <div className="overview-repo-meta">{repo.primaryLanguage&&<span>{repo.primaryLanguage}</span>}<span>✧ {formatCount(repo.stars)} stars</span><span>⑂ {formatCount(repo.forks)} forks</span></div>
    <small className="overview-repo-updated">Updated {formatRepositoryDate(repo.updatedAt)}</small>
  </button>
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '0'
}

function formatRepositoryDate(value) {
  if (typeof value !== 'string' || !value) return 'date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function RepositoryVisibility({ visibility }) {
  const normalized = typeof visibility === 'string' ? visibility.toLowerCase() : ''
  const label = normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : 'Unknown'
  return <span className={`visibility-pill ${normalized}`}><Icon name={normalized === 'public' ? 'globe' : 'lock'} size={12}/>{label}</span>
}

function RepositoryFeedback({ status, error, retry, empty = false }) {
  if (status === 'loading' || status === 'idle') {
    return <div className="repository-loading" role="status" aria-label="Loading repositories"><span/><span/><span/></div>
  }
  if (empty) return <div className="empty-state"><Icon name="repo" size={24}/><b>No repositories are available</b><span>The connected GitHub App currently has no accessible repositories.</span></div>
  const disconnected = error?.code === 'GITHUB_NOT_CONNECTED'
  const title = disconnected ? 'GitHub is not connected' : 'Repositories could not be loaded'
  const detail = disconnected
    ? 'Connect the GitHub account and an installed NEBULITH App to view repositories here.'
    : error?.status === 0
      ? 'NEBULITH could not reach the server. Check your connection and try again.'
      : error?.message || 'The repository request failed. Try again in a moment.'
  return <div className="repository-error" role="alert"><span className="repository-error-icon"><Icon name={disconnected ? 'github' : 'spark'} size={19}/></span><b>{title}</b><p>{detail}</p><Button kind="secondary" onClick={retry}>Retry repository load <Icon name="arrow" size={14}/></Button></div>
}

function getCommitErrorMessage(error) {
  if (error?.code === 'GITHUB_RATE_LIMITED') return Number.isSafeInteger(error.retryAfter)
    ? `GitHub rate limit reached. Retry in about ${error.retryAfter} seconds.`
    : 'GitHub rate limit reached. Wait briefly, then retry.'
  if (error?.code === 'GITHUB_NOT_CONNECTED') return 'Connect a GitHub App installation to load commit intelligence.'
  if (error?.status === 0) return 'NEBULITH could not reach the server. Check your connection and retry.'
  return error?.message || 'Commit data could not be loaded. Try again.'
}

function formatCommitDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (typeof value !== 'string' || !value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, options).format(date)
}

function CommitIntelligencePanel({ repositories: liveRepositories, repositoryStatus, repositoryError, retryRepositories, selectedRepository, onSelectRepository, intelligence }) {
  return <section className="panel commit-intelligence-panel"><div className="commit-panel-heading"><div><span className="section-index">REPOSITORY INTELLIGENCE</span><h2>Commit intelligence</h2><p>Explore real commit history and GitHub’s weekly activity for one repository.</p></div>{liveRepositories.length > 0&&<label className="commit-repository-picker"><span>Repository</span><select value={selectedRepository ? String(selectedRepository.id) : ''} onChange={(event)=>onSelectRepository(liveRepositories.find((repo)=>String(repo.id)===event.target.value)?.id)} aria-label="Choose repository for commit intelligence">{liveRepositories.map((repo)=><option value={String(repo.id)} key={repo.id}>{repo.fullName}</option>)}</select></label>}</div>{selectedRepository ? <div className="commit-intelligence-columns"><CommitActivityChart intelligence={intelligence} repositoryName={selectedRepository.fullName}/><CommitHistory intelligence={intelligence} repositoryName={selectedRepository.fullName} compact/></div> : <RepositoryFeedback status={repositoryStatus} error={repositoryError} retry={retryRepositories} empty={repositoryStatus === 'success'}/>}</section>
}

function getContributorErrorMessage(error) {
  if (error?.code === 'GITHUB_RATE_LIMITED') return Number.isSafeInteger(error.retryAfter)
    ? `GitHub rate limit reached. Retry in about ${error.retryAfter} seconds.`
    : 'GitHub rate limit reached. Wait briefly, then retry.'
  if (error?.code === 'GITHUB_NOT_CONNECTED') return 'Connect a GitHub App installation to load contributor intelligence.'
  if (error?.status === 0) return 'NEBULITH could not reach the server. Check your connection and retry.'
  return error?.message || 'Contributor data could not be loaded. Try again.'
}

function formatContributorDate(value) {
  if (!Number.isSafeInteger(value)) return 'Week unavailable'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value * 1000))
}

function ContributorIntelligencePanel({ repositories: liveRepositories, repositoryStatus, selectedRepository, onSelectRepository, intelligence, commitIntelligence }) {
  const [expandedContributor, setExpandedContributor] = useState(null)
  const contributors = intelligence.contributors
  const totalContributions = contributors.reduce((total, contributor) => total + contributor.contributions, 0)
  const verifiedCount = contributors.filter((contributor) => contributor.verified).length
  const anonymousCount = contributors.length - verifiedCount
  const allPagesLoaded = !intelligence.hasNext

  return <section className="panel contributor-intelligence-panel"><div className="contributor-panel-heading"><div><span className="section-index">REPOSITORY INTELLIGENCE</span><h2>Contributor intelligence</h2><p>GitHub-linked commit contributions and weekly repository participation.</p></div>{liveRepositories.length > 0&&<label className="contributor-repository-picker"><span>Repository</span><select value={selectedRepository ? String(selectedRepository.id) : ''} onChange={(event)=>onSelectRepository(liveRepositories.find((repo)=>String(repo.id)===event.target.value)?.id)} aria-label="Choose repository for contributor intelligence">{liveRepositories.map((repo)=><option value={String(repo.id)} key={repo.id}>{repo.fullName}</option>)}</select></label>}</div>
    {!selectedRepository&&<div className="contributor-feedback"><b>{repositoryStatus==='loading'?'Loading connected repositories':repositoryStatus==='error'?'Repositories are unavailable':'No repositories to analyze'}</b><p>{repositoryStatus==='error'?'Restore GitHub repository access to load contributors.':'Contributor intelligence requires a repository connected through the GitHub App.'}</p></div>}
    {selectedRepository&&<>
      <div className="contributor-caveat"><Icon name="clock" size={14}/><span>GitHub caches contributor attribution, so counts may lag by a few hours. Only the first 500 author email addresses may map to GitHub accounts; other records remain anonymous. Commit counts do not measure developer effort.</span></div>
      {intelligence.contributorsStatus==='loading'&&<div className="contributor-list-skeleton" role="status" aria-label="Loading contributors"><i/><i/><i/><i/><i/></div>}
      {intelligence.contributorsStatus==='error'&&<div className="contributor-feedback" role="alert"><b>Contributors could not be loaded</b><p>{getContributorErrorMessage(intelligence.contributorsError)}</p><Button kind="secondary" onClick={intelligence.retryContributors}>Retry contributors</Button></div>}
      {intelligence.contributorsStatus==='success'&&contributors.length===0&&<div className="contributor-feedback"><b>No contributors were returned</b><p>GitHub reported no contributor records for {selectedRepository.fullName}.</p></div>}
      {intelligence.contributorsStatus==='success'&&contributors.length>0&&<>
        <div className="contributor-summary"><div><span>VERIFIED ACCOUNTS{intelligence.hasNext?' · LOADED':''}</span><b>{verifiedCount.toLocaleString()}{intelligence.hasNext?'+':''}</b></div><div><span>ANONYMOUS RECORDS{intelligence.hasNext?' · LOADED':''}</span><b>{anonymousCount.toLocaleString()}{intelligence.hasNext?'+':''}</b></div><div><span>CONTRIBUTIONS LOADED</span><b>{totalContributions.toLocaleString()}</b></div></div>
        <div className="contributor-content-grid"><section className="contributor-ranking-block"><div className="contributor-subheading"><div><h3>Top contributors</h3><span>{selectedRepository.fullName} · ranked by GitHub contribution count</span></div><span className="contributor-live-badge"><i/> LIVE</span></div><div className="contributor-list">{contributors.map((contributor,index)=>{
          const contributorKey=contributor.verified?`user:${contributor.id}`:`anonymous:${index}`
          const expanded=expandedContributor===contributorKey
          const share=allPagesLoaded&&totalContributions>0?contributor.contributions/totalContributions*100:null
          const activity=intelligence.activityContributors.find((item)=>item.id===contributor.id)
          const profileUrl=contributor.verified?getSafeGithubUrl(contributor.profileUrl):null
          return <article className={`contributor-entry ${expanded?'is-expanded':''}`} key={contributorKey}><div className="contributor-entry-main"><span className="contributor-rank">{String(index+1).padStart(2,'0')}</span><button className="contributor-toggle" onClick={()=>setExpandedContributor(expanded?null:contributorKey)} aria-expanded={expanded}><span className="contributor-avatar">{contributor.verified&&contributor.avatarUrl?<img src={contributor.avatarUrl} alt="" loading="lazy"/>:<Icon name="user" size={15}/>}</span><span className="contributor-title"><b>{contributor.verified?contributor.login:'Anonymous contributor'}</b><small>{contributor.verified?'Verified GitHub account':'No verified GitHub account linked'}</small></span></button><span className="contributor-count"><b>{contributor.contributions.toLocaleString()}</b><small>commits</small></span>{profileUrl&&<a className="contributor-profile-link" href={profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${contributor.login} GitHub profile`}><Icon name="external" size={13}/></a>}</div>
            {share!==null?<div className="contributor-share"><span>Share of attributed contributor commits</span><b>{formatLanguagePercentage(share)}</b><div className="language-ranking-track"><i style={{width:`${share}%`}}/></div></div>:intelligence.hasNext&&<div className="contributor-share-unavailable">Load all contributor pages to calculate contribution shares.</div>}
            {expanded&&<div className="contributor-expanded-details">{contributor.verified?<><div><span>GitHub profile</span>{profileUrl?<a href={profileUrl} target="_blank" rel="noopener noreferrer">@{contributor.login} <Icon name="external" size={11}/></a>:<b>@{contributor.login}</b>}</div><div><span>Contribution count</span><b>{contributor.contributions.toLocaleString()} commits{share!==null?` · ${formatLanguagePercentage(share)} of attributed total`:''}</b></div>{!contributor.verified?<p>No verified GitHub account is attached to this contributor record.</p>:intelligence.activityStatus==='ready'&&activity?<ContributorSparkline weeks={activity.weeks}/>:<p>{intelligence.activityStatus==='computing'?'GitHub is preparing weekly contributor statistics.':intelligence.activityStatus==='unavailable'?'GitHub has no weekly statistics available for this repository.':'Per-account weekly activity is unavailable.'}</p>}</>:<p>GitHub did not link this contributor record to an account. No profile, avatar, name or email is inferred.</p>}</div>}
            {expanded&&contributor.verified&&<ContributorRecentCommits contributor={contributor} intelligence={commitIntelligence}/>}
          </article>
        })}</div>{intelligence.hasNext&&<div className="contributor-load-more"><Button kind="secondary" disabled={intelligence.loadingMore} onClick={intelligence.loadMore}>{intelligence.loadingMore?'Loading contributors…':'Load more contributors'}</Button>{intelligence.loadMoreError&&<span role="alert">{getContributorErrorMessage(intelligence.loadMoreError)} <button onClick={intelligence.loadMore}>Retry</button></span>}</div>}
        <p className="contributor-share-note">{allPagesLoaded?'Share is each contributor’s GitHub contribution count divided by the sum of returned contributor counts.':'Contribution share is withheld until all GitHub contributor pages are loaded.'}</p>
      </section><ContributorActivityChart intelligence={intelligence} repositoryName={selectedRepository.fullName}/></div>
      </>}
    </>}
  </section>
}

function ContributorSparkline({ weeks }) {
  const visible=[...weeks].slice(-12)
  const max=Math.max(0,...visible.map((week)=>week.commits))
  return visible.length>0?<div className="contributor-sparkline" role="img" aria-label="Recent weekly commits by this verified contributor">{visible.map((week)=><span key={week.week} title={`Week of ${formatContributorDate(week.week)}: ${week.commits} commits`}><i style={{height:`${max===0?1:Math.max(3,week.commits/max*100)}%`}}/><small>{formatContributorDate(week.week)}</small></span>)}</div>:<p>No weekly activity buckets were returned for this contributor.</p>
}

function ContributorRecentCommits({ contributor, intelligence }) {
  const commits=intelligence.commits.filter((commit)=>commit.authorVerified===true&&commit.authorLogin===contributor.login).slice(0,5)
  return <div className="contributor-recent-commits"><b>Recent commits by @{contributor.login}</b>{intelligence.commitsStatus==='loading'?<span>Loading verified commit history…</span>:intelligence.commitsStatus==='error'?<span>Commit history is unavailable right now.</span>:commits.length>0?commits.map((commit)=>{const url=getSafeGithubUrl(commit.url);const message=typeof commit.message==='string'?commit.message.split(/\r?\n/,1)[0]:'Commit message unavailable';return <div className="contributor-recent-commit" key={commit.sha}><span>{message}</span><small>{formatCommitDate(commit.date)}</small>{url&&<a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open commit by ${contributor.login} on GitHub`}><Icon name="external" size={11}/></a>}</div>}):<span>No matching commit in the currently loaded history. Load more commits in Commit Intelligence to expand the search.</span>}</div>
}

function ContributorActivityChart({ intelligence, repositoryName }) {
  const weeks=intelligence.weeks.slice(-16)
  const max=Math.max(0,...weeks.map((week)=>week.commits))
  return <section className="contributor-activity-block"><div className="contributor-subheading"><div><h3>Weekly contribution activity</h3><span>{repositoryName} · GitHub contributor statistics</span></div><span className="contributor-period-note">Recent weeks</span></div>
    {intelligence.activityStatus==='loading'&&<div className="contributor-activity-skeleton" role="status" aria-label="Loading contributor activity"><i/><i/><i/><i/><i/><i/></div>}
    {intelligence.activityStatus==='error'&&<div className="contributor-activity-feedback" role="alert"><p>{getContributorErrorMessage(intelligence.activityError)}</p><Button kind="secondary" onClick={intelligence.retryActivity}>Retry activity</Button></div>}
    {intelligence.activityStatus==='computing'&&<div className="contributor-activity-feedback" role="status"><p>GitHub is computing cached contributor statistics. Try again shortly.</p><Button kind="secondary" onClick={intelligence.retryActivity}>Check again</Button></div>}
    {intelligence.activityStatus==='unavailable'&&<div className="contributor-activity-feedback" role="status"><p>GitHub did not provide contributor activity statistics. This is unavailable data, not zero activity.</p><Button kind="secondary" onClick={intelligence.retryActivity}>Retry activity</Button></div>}
    {intelligence.activityStatus==='ready'&&weeks.length===0&&<div className="contributor-activity-feedback" role="status"><p>No weekly contributor activity buckets were returned.</p></div>}
    {intelligence.activityStatus==='ready'&&weeks.length>0&&<><div className="contributor-activity-total"><b>{weeks.reduce((sum,week)=>sum+week.commits,0).toLocaleString()}</b><span>commits across the displayed weekly buckets</span></div><div className="contributor-week-chart" role="img" aria-label={`Weekly commits across contributor records for ${repositoryName}`}>{weeks.map((week)=><span key={week.week} title={`Week of ${formatContributorDate(week.week)}: ${week.commits} commits`}><i style={{height:`${max===0?1:Math.max(3,week.commits/max*100)}%`}}/><small>{formatContributorDate(week.week)}</small></span>)}</div></>}
  </section>
}

function RecentRepositoryActivity({ intelligence, repositoryName }) {
  const commits=intelligence.commits.slice(0,5)
  return <section className="panel activity-feed live-repository-activity"><div className="panel-heading"><div><h2>Recent activity</h2><p>{repositoryName?`${repositoryName} · live commit history`:'Live repository commit history'}</p></div><span className="commit-live-label"><i/> LIVE</span></div>
    {intelligence.commitsStatus==='loading'&&<div className="commit-history-skeleton" role="status" aria-label="Loading recent repository commits"><i/><i/><i/></div>}
    {intelligence.commitsStatus==='error'&&<div className="recent-activity-feedback" role="alert"><p>{getCommitErrorMessage(intelligence.commitsError)}</p><Button kind="secondary" onClick={intelligence.retryHistory}>Retry recent commits</Button></div>}
    {intelligence.commitsStatus==='success'&&commits.length===0&&<div className="recent-activity-feedback"><p>No recent commits were returned for this repository.</p></div>}
    {intelligence.commitsStatus==='success'&&commits.map((commit)=>{const url=getSafeGithubUrl(commit.url);const message=typeof commit.message==='string'?commit.message.split(/\r?\n/,1)[0]:'Commit message unavailable';return <div className="recent-commit-item" key={commit.sha}><span className="recent-commit-marker"><Icon name="code" size={13}/></span><span className="recent-commit-copy"><b>{message}</b><small>{formatCommitDate(commit.date)}</small></span>{url&&<a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open commit on GitHub"><Icon name="external" size={13}/></a>}</div>})}
  </section>
}

const LANGUAGE_COLORS = ['#a89aff', '#63c4d4', '#d48ad6', '#7fc69a', '#e0b875', '#7d92df', '#d97e9f', '#9aa8bb']

function getLanguageColor(name) {
  const index = [...name].reduce((sum, character) => sum + character.codePointAt(0), 0) % LANGUAGE_COLORS.length
  return LANGUAGE_COLORS[index]
}

function formatLanguagePercentage(value) {
  if (value > 0 && value < 0.01) return '<0.01%'
  return `${Number(value.toFixed(2))}%`
}

function formatLanguageBytes(value) {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000
    unit += 1
  }
  return unit === 0 ? `${value.toLocaleString()} bytes` : `${size.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unit]}`
}

function LanguageIntelligencePanel({ intelligence }) {
  const [selectedRepository, setSelectedRepository] = useState('all')
  const data = intelligence.data
  const selected = data?.repositories.find((repository) => repository.fullName === selectedRepository)
  const languages = data?.aggregate.languages || []
  const totalBytes = data?.aggregate.totalBytes || 0
  const segments = languages.reduce((result, language) => {
    const start = result.offset
    const end = start + language.percentage
    result.parts.push(`${getLanguageColor(language.name)} ${start}% ${end}%`)
    result.offset = end
    return result
  }, { offset: 0, parts: [] }).parts.join(', ')

  return <section className="panel language-intelligence-panel"><div className="language-intelligence-heading"><div><span className="section-index">REPOSITORY INTELLIGENCE</span><h2>Language intelligence</h2><p>GitHub’s language byte attribution across your installed repositories.</p></div><span className="commit-live-label"><i/> LIVE</span></div>
    {intelligence.status === 'loading'&&<div className="language-intelligence-skeleton" role="status" aria-label="Loading GitHub language data"><i/><i/><i/><i/><i/></div>}
    {intelligence.status === 'error'&&<div className="language-intelligence-feedback" role="alert"><span className="language-feedback-mark"><Icon name="chart" size={18}/></span><b>{intelligence.error?.code === 'GITHUB_NOT_CONNECTED' ? 'Connect GitHub to load language intelligence' : 'Language data could not be loaded'}</b><p>{intelligence.error?.code === 'GITHUB_RATE_LIMITED' ? 'GitHub rate limit reached. Wait briefly, then retry.' : intelligence.error?.code === 'GITHUB_NOT_CONNECTED' ? 'Connect an installed GitHub App in Settings, then retry.' : intelligence.error?.status === 0 ? 'NEBULITH could not reach the server. Check your connection and retry.' : intelligence.error?.message || 'The GitHub language request failed. Try again.'}</p><Button kind="secondary" onClick={intelligence.retry}>Retry language data</Button></div>}
    {intelligence.status === 'success'&&totalBytes === 0&&<div className="language-intelligence-feedback"><span className="language-feedback-mark"><Icon name="code" size={18}/></span><b>No language bytes are available</b><p>GitHub returned no language attribution for the accessible repositories.</p></div>}
    {intelligence.status === 'success'&&totalBytes > 0&&<>
      <div className="language-intelligence-summary"><div><span>AGGREGATE SOURCE</span><b>{data.repositories.length.toLocaleString()} repositories</b></div><div><span>LANGUAGE BYTES</span><b>{formatLanguageBytes(totalBytes)}</b><small>{totalBytes.toLocaleString()} bytes</small></div><div><span>LANGUAGES</span><b>{languages.length.toLocaleString()}</b></div></div>
      <div className="language-intelligence-grid"><section className="language-distribution-block"><div className="language-subheading"><h3>Overall distribution</h3><span>Share of aggregate language bytes</span></div><div className="language-distribution-content"><div className="language-live-donut" role="img" aria-label={`Language distribution across ${data.repositories.length} repositories, total ${totalBytes.toLocaleString()} bytes`} style={{ background: `conic-gradient(${segments})` }}><div><b>{languages.length}</b><span>languages</span></div></div><div className="language-ranking" aria-label="Language ranking">{languages.map((language) => <div className="language-ranking-row" key={language.name} title={`${language.name}: ${language.bytes.toLocaleString()} bytes, ${formatLanguagePercentage(language.percentage)}, used in ${language.repositoryCount} repositories`}><div className="language-ranking-label"><span><i style={{ background: getLanguageColor(language.name) }}/>{language.name}</span><b>{formatLanguagePercentage(language.percentage)}</b></div><div className="language-ranking-track"><i style={{ width: `${language.percentage}%`, background: getLanguageColor(language.name) }}/></div><small>{formatLanguageBytes(language.bytes)} · {language.bytes.toLocaleString()} bytes · {language.repositoryCount} {language.repositoryCount === 1 ? 'repository' : 'repositories'}</small></div>)}</div></div></section>
        <section className="repository-language-block"><div className="language-subheading"><div><h3>Repository breakdown</h3><span>Per-repository byte shares</span></div><label><span className="sr-only">Choose a repository language breakdown</span><select value={selectedRepository} onChange={(event) => setSelectedRepository(event.target.value)} aria-label="Select repository for language breakdown"><option value="all">Choose repository…</option>{data.repositories.map((repository) => <option value={repository.fullName} key={repository.id}>{repository.fullName}</option>)}</select></label></div>{selected ? selected.languages.length > 0 ? <><div className="repository-language-total"><b>{selected.fullName}</b><span>{formatLanguageBytes(selected.totalBytes)} · {selected.totalBytes.toLocaleString()} bytes</span></div><div className="repository-language-list">{selected.languages.map((language) => <div className="repository-language-row" key={language.name} title={`${language.bytes.toLocaleString()} bytes · ${formatLanguagePercentage(language.percentage)}`}><span><i style={{ background: getLanguageColor(language.name) }}/>{language.name}</span><div className="language-ranking-track"><i style={{ width: `${language.percentage}%`, background: getLanguageColor(language.name) }}/></div><b>{formatLanguagePercentage(language.percentage)}</b><small>{formatLanguageBytes(language.bytes)} · {language.bytes.toLocaleString()} bytes</small></div>)}</div></> : <div className="repository-language-empty"><b>No language attribution</b><span>GitHub returned no language bytes for {selected.fullName}.</span></div> : <div className="repository-language-empty"><b>Select a repository</b><span>Inspect its language byte totals and share of repository language bytes.</span></div>}</section></div>
      <p className="language-attribution-note"><Icon name="spark" size={13}/>{data.attribution || 'GitHub language byte attribution is approximate and does not measure developer effort.'}</p>
    </>}
  </section>
}

function CommitActivityChart({ intelligence, repositoryName }) {
  const [period, setPeriod] = useState(13)
  const allWeeks = [...intelligence.weeks].sort((a, b) => a.week - b.week)
  const weeks = allWeeks.slice(-period)
  const total = weeks.reduce((sum, week) => sum + week.total, 0)
  const maximum = Math.max(0, ...weeks.map((week) => week.total))
  const latest = weeks.at(-1)
  const previous = weeks.at(-2)
  const title = (week) => formatCommitDate(new Date(week.week * 1000).toISOString(), { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return <section className="commit-activity-card" aria-labelledby="commit-activity-title"><div className="commit-section-heading"><div><h3 id="commit-activity-title">Weekly commit activity</h3><p>{repositoryName}</p></div>{intelligence.activityStatus === 'ready'&&allWeeks.length > 0&&<label className="commit-period-picker"><span className="sr-only">Activity period</span><select value={period} onChange={(event)=>setPeriod(Number(event.target.value))} aria-label="Commit activity period"><option value={1}>1 week · 7 days</option><option value={4}>4 weeks · 28 days</option><option value={13}>13 weeks · 91 days</option><option value={52}>52 weeks · 1 year</option></select></label>}</div>
    {intelligence.activityStatus === 'loading'&&<div className="commit-chart-skeleton" role="status" aria-label="Loading commit activity"><i/><i/><i/><i/><i/><i/><i/><i/></div>}
    {intelligence.activityStatus === 'error'&&<div className="commit-inline-error" role="alert"><p>{getCommitErrorMessage(intelligence.activityError)}</p><Button kind="secondary" onClick={intelligence.retryActivity}>Retry activity</Button></div>}
    {intelligence.activityStatus === 'computing'&&<div className="commit-activity-notice" role="status"><Icon name="clock" size={17}/><span>GitHub is preparing repository statistics. Wait a little, then ask for an update.</span><Button kind="secondary" onClick={intelligence.retryActivity}>Check again</Button></div>}
    {intelligence.activityStatus === 'unavailable'&&<div className="commit-activity-notice" role="status"><Icon name="chart" size={17}/><span>GitHub did not provide activity statistics. This is unavailable data, not a zero-commit result.</span><Button kind="secondary" onClick={intelligence.retryActivity}>Try statistics again</Button></div>}
    {intelligence.activityStatus === 'ready'&&allWeeks.length===0&&<div className="commit-activity-notice" role="status"><Icon name="chart" size={17}/><span>No weekly activity buckets were returned, so this period cannot be summarized.</span></div>}
    {intelligence.activityStatus === 'ready'&&weeks.length>0&&<><div className="commit-chart-summary"><b>{total.toLocaleString()} commits</b><span>across {weeks.length} weekly buckets · Sunday–Saturday · {period === 52 ? 'up to one year' : `up to ${period * 7} days`}</span></div><div className="commit-chart-scroll"><div className="commit-chart-bars" role="img" aria-label={`${total} commits across ${weeks.length} weekly buckets for ${repositoryName}`}>
      {weeks.map((week)=><span className="commit-chart-week" key={week.week} title={`Week of ${title(week)}: ${week.total} commits`}><i style={{height:`${maximum===0?2:Math.max(5,(week.total/maximum)*100)}%`}}/><small>{title(week)}</small></span>)}
    </div></div><div className="commit-trend-note">{latest&&previous ? <>Latest week: <b>{latest.total.toLocaleString()}</b> · previous week: <b>{previous.total.toLocaleString()}</b></> : 'One weekly bucket is available; there is no prior week to compare.'}</div></>}
  </section>
}

function CommitHistory({ intelligence, repositoryName, compact = false }) {
  const commits = compact ? intelligence.commits.slice(0, 5) : intelligence.commits
  return <section className={`commit-history-card ${compact ? 'commit-history-compact' : ''}`} aria-labelledby={compact ? 'overview-commit-history-title' : 'repository-commit-history-title'}><div className="commit-section-heading"><div><h3 id={compact ? 'overview-commit-history-title' : 'repository-commit-history-title'}>Recent commits</h3><p>{repositoryName}</p></div><span className="commit-live-label"><i/> LIVE</span></div>
    {intelligence.commitsStatus === 'loading'&&<div className="commit-history-skeleton" role="status" aria-label="Loading commit history"><i/><i/><i/><i/></div>}
    {intelligence.commitsStatus === 'error'&&<div className="commit-inline-error" role="alert"><p>{getCommitErrorMessage(intelligence.commitsError)}</p><Button kind="secondary" onClick={intelligence.retryHistory}>Retry commit history</Button></div>}
    {intelligence.commitsStatus === 'success'&&intelligence.commits.length===0&&<div className="commit-history-empty"><Icon name="code" size={19}/><b>No commits were returned</b><span>This repository has no commit history available to this installation.</span></div>}
    {intelligence.commitsStatus === 'success'&&commits.length>0&&<div className="commit-list">{commits.map((commit)=>{
      const expanded = intelligence.selectedSha === commit.sha
      const githubUrl = getSafeGithubUrl(commit.url)
      const summary = typeof commit.message === 'string' ? commit.message.split(/\r?\n/, 1)[0] : 'Commit message unavailable'
      return <article className={`commit-entry ${expanded ? 'is-expanded' : ''}`} key={commit.sha}><div className="commit-entry-main"><button className="commit-message-button" onClick={()=>expanded?intelligence.closeCommitDetails():intelligence.selectCommit(commit.sha)} aria-expanded={expanded}><b title={summary}>{summary}</b><span>{commit.author || 'Author unavailable'}<i>·</i>{formatCommitDate(commit.date)}</span></button><code title={commit.sha}>{typeof commit.sha === 'string' ? commit.sha.slice(0,7) : 'SHA unavailable'}</code>{githubUrl&&<a href={githubUrl} target="_blank" rel="noopener noreferrer" className="commit-github-link" aria-label={`Open commit ${commit.sha} on GitHub`}><Icon name="external" size={13}/></a>}</div>
        {expanded&&<div className="commit-details-panel">{intelligence.detailsStatus==='loading'&&<span className="commit-detail-loading" role="status">Loading commit details…</span>}{intelligence.detailsStatus==='error'&&<div className="commit-inline-error" role="alert"><p>{getCommitErrorMessage(intelligence.detailsError)}</p><Button kind="secondary" onClick={()=>intelligence.selectCommit(commit.sha)}>Retry details</Button></div>}{intelligence.detailsStatus==='success'&&intelligence.details&&<><p className="commit-full-message">{intelligence.details.message || 'Commit message unavailable'}</p>{intelligence.details.stats ? <div className="commit-diff-stats"><span><b>+{intelligence.details.stats.additions.toLocaleString()}</b> additions</span><span><b>−{intelligence.details.stats.deletions.toLocaleString()}</b> deletions</span></div> : <span className="commit-no-stats">GitHub did not provide line-change statistics for this commit.</span>}</>}</div>}
      </article>
    })}</div>}
    {intelligence.commitsStatus==='success'&&intelligence.hasNext&&<div className="commit-load-more"><Button kind="secondary" disabled={intelligence.loadingMore} onClick={intelligence.loadMore}>{intelligence.loadingMore?'Loading more commits…':'Load more commits'}</Button>{intelligence.loadingMore&&<span className="auth-spinner" aria-hidden="true"/>}</div>}
    {intelligence.loadMoreError&&<div className="commit-load-more-error" role="alert">{getCommitErrorMessage(intelligence.loadMoreError)} <button onClick={intelligence.loadMore}>Retry</button></div>}
  </section>
}

function parseMetric(value) {
  const match = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(String(value))
  if (!match) return null
  return { prefix: match[1], raw: match[2], suffix: match[3], number: Number(match[2].replaceAll(',', '')) }
}

function formatMetric(metric, number) {
  const decimals = metric.raw.includes('.') ? metric.raw.split('.')[1].length : 0
  const rounded = decimals ? number.toFixed(decimals) : String(Math.round(number))
  const [whole, fraction] = rounded.split('.')
  const formattedWhole = metric.raw.includes(',')
    ? Number(whole).toLocaleString('en-US')
    : whole.padStart(metric.raw.replaceAll(',', '').split('.')[0].length, '0')
  return `${metric.prefix}${fraction ? `${formattedWhole}.${fraction}` : formattedWhole}${metric.suffix}`
}

function AnimatedValue({ value }) {
  const metric = useMemo(() => parseMetric(value), [value])
  const [progress, setProgress] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0)

  useEffect(() => {
    if (!metric || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let frameId
    let startedAt
    const duration = 680
    const animate = (time) => {
      if (startedAt === undefined) startedAt = time
      const progress = Math.min((time - startedAt) / duration, 1)
      const eased = 1 - ((1 - progress) ** 3)
      setProgress(progress === 1 ? 1 : eased)
      if (progress < 1) frameId = window.requestAnimationFrame(animate)
    }
    frameId = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frameId)
  }, [metric])

  return <span className="animated-value" aria-label={String(value)}>{metric ? formatMetric(metric, metric.number * progress) : String(value)}</span>
}

function StatCard({ label, value, delta, icon, tone }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><i className={`stat-icon ${tone}`}><Icon name={icon} size={17}/></i></div><strong><AnimatedValue key={value} value={value}/></strong><small>{delta}</small></article>
}

function ActivityChart({ compact = false }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const points = activity.map((value,i) => `${(i/(activity.length-1))*600},${132-value*1.28}`).join(' ')
  const area = `0,145 ${points} 600,145`
  const hoveredValue = hoveredPoint === null ? null : activity[hoveredPoint]
  const tooltipX = hoveredPoint === null ? 0 : 6 + (hoveredPoint / (activity.length - 1)) * 88
  const tooltipY = hoveredPoint === null ? 0 : ((132 - hoveredValue * 1.28) / 145) * 76
  return <div className={`activity-chart ${compact ? 'activity-chart-compact' : ''}`}><div className="chart-y-labels"><span>80</span><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="chart-svg-wrap" onPointerLeave={() => setHoveredPoint(null)}><div className="chart-gridlines"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 600 145" preserveAspectRatio="none" aria-label="Sample contribution activity trend"><defs><linearGradient id="activityFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9b8cff" stopOpacity=".22"/><stop offset="1" stopColor="#9b8cff" stopOpacity="0"/></linearGradient></defs><polygon points={area} fill="url(#activityFill)"/><polyline points={points} fill="none" stroke="#a394ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>{activity.map((v,i)=><g key={i} className={hoveredPoint===i?'chart-point-group is-active':'chart-point-group'} onPointerEnter={() => setHoveredPoint(i)} onFocus={() => setHoveredPoint(i)} onBlur={() => setHoveredPoint(null)} tabIndex="0" role="button" aria-label={`${v} sample contributions`}><circle cx={(i/(activity.length-1))*600} cy={132-v*1.28} r="10" fill="transparent"/><circle cx={(i/(activity.length-1))*600} cy={132-v*1.28} r={hoveredPoint===i?5:3} fill="#b3a7ff" className="chart-point"/><title>{`${v} sample contributions`}</title></g>)}</svg>{hoveredValue!==null&&<div className="chart-tooltip" style={{left:`${tooltipX}%`,top:`${Math.max(4,tooltipY)}%`}}><b>{hoveredValue} contributions</b><span>Sample activity · day {hoveredPoint + 1}</span></div>}<div className="chart-x-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div>
}

function LanguageChart() {
  const total = languages.reduce((sum,item)=>sum+item.percent,0)
  const { parts: gradientParts } = languages.reduce((acc,item)=>{
    const next = acc.offset + item.percent
    return { offset: next, parts: [...acc.parts, `${item.color} ${acc.offset/total*100}% ${next/total*100}%`] }
  },{offset:0,parts:[]})
  const segments = gradientParts.join(', ')
  return <div className="language-chart-wrap"><div className="language-donut" style={{background:`conic-gradient(${segments})`}}><div><strong>6</strong><span>languages</span></div></div><span className="donut-caption">Most used <b>TypeScript</b></span></div>
}

function RepoTable({ repos, openRepo }) {
  return <div className="repo-table"><div className="repo-table-head"><span>REPOSITORY</span><span>VISIBILITY</span><span>LANGUAGE</span><span>STARS</span><span>UPDATED</span><i/></div>{repos.map((repo)=><button className="repo-row" key={repo.id} onClick={() => openRepo(repo)}><span className="repo-name-cell"><span className="repo-symbol"><Icon name="repo" size={15}/></span><span><b>{repo.name}</b><small>{repo.fullName}</small></span></span><span><RepositoryVisibility visibility={repo.visibility}/></span><span className="language-cell">{repo.primaryLanguage || '—'}</span><span className="stars-cell">✧ {formatCount(repo.stars)}</span><span className="updated-cell">{formatRepositoryDate(repo.updatedAt)}</span><Icon name="chevron" size={15} className="row-chevron"/></button>)}</div>
}

function Repositories({ repositories: allRepositories, status, error, retry, openRepo }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const visibilityOptions = useMemo(() => {
    const options = ['all', 'public', 'private']
    if (allRepositories.some((repository) => repository.visibility === 'internal')) options.push('internal')
    return options
  }, [allRepositories])
  const filtered = useMemo(() => allRepositories
    .filter((repo) => {
      const query = search.trim().toLowerCase()
      const matchesSearch = !query || [repo.name, repo.fullName, repo.description, repo.primaryLanguage]
        .some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
      return matchesSearch && (filter === 'all' || repo.visibility === filter)
    })
    .sort((a, b) => {
      const dateA = Date.parse(a.updatedAt || '')
      const dateB = Date.parse(b.updatedAt || '')
      if (!Number.isFinite(dateA)) return Number.isFinite(dateB) ? 1 : 0
      if (!Number.isFinite(dateB)) return -1
      return dateB - dateA
    }), [allRepositories, search, filter])
  const counts = useMemo(() => allRepositories.reduce((result, repo) => {
    result[repo.visibility] = (result[repo.visibility] || 0) + 1
    return result
  }, {}), [allRepositories])

  return <><PageHeader eyebrow="CONNECTED GITHUB APP" title="Repositories" detail="Repositories available to your linked GitHub App installation."/><div className="repo-toolbar"><label className="search-field"><Icon name="search" size={17}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search repositories…" aria-label="Search repositories"/><kbd>⌘ K</kbd></label><div className="filter-tabs" role="group" aria-label="Filter repositories">{visibilityOptions.map((item)=><button key={item} className={filter===item?'selected':''} onClick={()=>setFilter(item)}>{item === 'all' ? 'All repositories' : `${item[0].toUpperCase()}${item.slice(1)}`}<small>{item === 'all' ? allRepositories.length : counts[item] || 0}</small></button>)}</div></div><section className="panel repositories-page-panel"><div className="repo-results-head"><span>{status === 'success' ? `${filtered.length} of ${allRepositories.length} repositories` : 'Live GitHub repositories'}</span><span>Sorted by last updated <span className="sort-chevron">⌄</span></span></div>{status !== 'success' ? <RepositoryFeedback status={status} error={error} retry={retry}/> : filtered.length ? <RepoTable repos={filtered} openRepo={openRepo}/> : <div className="empty-state"><Icon name={search || filter !== 'all' ? 'search' : 'repo'} size={24}/><b>{search || filter !== 'all' ? 'No repositories match' : 'No repositories are available'}</b><span>{search || filter !== 'all' ? 'Try another search or visibility filter.' : 'The connected GitHub App currently has no accessible repositories.'}</span></div>}</section><div className="live-data-note"><Icon name="github" size={14}/> Repository information is provided by the GitHub App installation linked to your NEBULITH account.</div></>
}

function getPullRequestErrorMessage(error) {
  if (error?.code === 'GITHUB_RATE_LIMITED') return Number.isSafeInteger(error.retryAfter)
    ? `GitHub rate limit reached. Retry in about ${error.retryAfter} seconds.`
    : 'GitHub rate limit reached. Wait briefly, then retry.'
  if (error?.code === 'GITHUB_NOT_CONNECTED') return 'Connect your GitHub App account to browse pull requests.'
  if (error?.status === 0) return 'NEBULITH could not reach the server. Check your connection and retry.'
  return error?.message || 'Pull request data could not be loaded. Try again.'
}

function Reviews({ repositories, repositoryStatus, repositoryError, retryRepositories }) {
  const [savedSelection] = useState(() => readCodeReviewSelection(getWorkspaceSessionStorage()))
  const [repositoryId, setRepositoryId] = useState(savedSelection.repositoryId)
  const [stateFilter, setStateFilter] = useState(savedSelection.stateFilter)
  const [search, setSearch] = useState('')
  const [selectedNumber, setSelectedNumber] = useState(savedSelection.pullNumber)
  const requestedRepository = repositories.find((repository) => String(repository.id) === repositoryId)
  const selectedRepository = requestedRepository || repositories[0] || null
  const restoredRepositoryMissing = repositoryStatus === 'success' && Boolean(repositoryId) && !requestedRepository
  const selectedNumberForRepository = restoredRepositoryMissing ? null : selectedNumber
  const list = usePullRequestList(repositoryStatus === 'success' && Boolean(selectedRepository), selectedRepository, stateFilter)
  const visiblePullRequests = filterPullRequests(list.pullRequests, stateFilter, search)
  const selectedPull = visiblePullRequests.find((pullRequest) => pullRequest.number === selectedNumberForRepository)
    || (selectedNumberForRepository ? { number: selectedNumberForRepository, title: `Pull request #${selectedNumberForRepository}`, state: stateFilter === 'open' ? 'open' : 'closed' } : visiblePullRequests[0])
  const details = usePullRequestDetails(Boolean(selectedRepository) && Boolean(selectedPull), selectedRepository, selectedPull?.number ?? null)

  useEffect(() => {
    if (!selectedRepository) return
    saveCodeReviewSelection(getWorkspaceSessionStorage(), { repositoryId: String(selectedRepository.id), pullNumber: selectedNumberForRepository, stateFilter })
  }, [selectedRepository, selectedNumberForRepository, stateFilter])

  const states = [
    ['open', 'Open'],
    ['closed', 'Closed'],
    ['merged', 'Merged'],
    ['all', 'All'],
  ]
  const repositoryMessage = repositoryStatus === 'loading'
    ? 'Loading connected repositories…'
    : repositoryStatus === 'error'
      ? getPullRequestErrorMessage(repositoryError)
      : 'No repositories are available to this GitHub App installation.'

  return <>
    <PageHeader eyebrow="CONNECTED GITHUB APP" title="Pull requests" detail="Browse pull requests and inspect their changes. This page is read-only; no AI review or GitHub action is run." action={selectedRepository?.fullName && <span className="prototype-label"><Icon name="github" size={13}/> LIVE GITHUB DATA</span>}/>
    <section className="panel pr-workspace">
      <div className="pr-workspace-toolbar">
        <label className="pr-repository-select"><span>Repository</span><select value={selectedRepository ? String(selectedRepository.id) : ''} onChange={(event) => { setRepositoryId(event.target.value); setSelectedNumber(null); saveCodeReviewSelection(getWorkspaceSessionStorage(), { repositoryId: event.target.value, pullNumber: null, stateFilter }) }} disabled={!repositories.length} aria-label="Repository for pull requests"><option value="">{repositories.length ? 'Choose repository' : 'No repositories'}</option>{repositories.map((repository) => <option key={repository.id} value={String(repository.id)}>{repository.fullName}</option>)}</select></label>
        {selectedRepository && <label className="pr-search"><Icon name="search" size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, author or #number" aria-label="Search pull requests"/></label>}
        <div className="review-filter pr-state-filter" role="group" aria-label="Filter pull requests">{states.map(([value, label]) => <button type="button" key={value} className={stateFilter === value ? 'selected' : ''} aria-pressed={stateFilter === value} onClick={() => { setStateFilter(value); setSelectedNumber(null); saveCodeReviewSelection(getWorkspaceSessionStorage(), { repositoryId: selectedRepository?.id ? String(selectedRepository.id) : '', pullNumber: null, stateFilter: value }) }}>{label}</button>)}</div>
      </div>
      {repositoryStatus !== 'success' || !selectedRepository ? <div className="pr-feedback" role={repositoryStatus === 'error' ? 'alert' : 'status'}><Icon name="repo" size={22}/><b>{repositoryStatus === 'success' ? 'No connected repositories' : repositoryStatus === 'loading' ? 'Loading repositories' : 'Repositories unavailable'}</b><span>{repositoryMessage}</span>{repositoryStatus !== 'loading' && <Button kind="secondary" onClick={retryRepositories}>Retry repositories</Button>}</div> : <div className="pr-browser">
        <section className="panel pr-list"><div className="panel-heading"><div><h2>Pull requests</h2><p>{selectedRepository.fullName} · {stateFilter === 'all' ? 'all states' : stateFilter}</p></div><button className="quiet-button" type="button" onClick={list.retry}>Refresh</button></div>
          {list.status === 'loading' && <div className="pr-feedback" role="status"><span className="pr-spinner"/>Loading pull requests…</div>}
          {list.status === 'error' && <div className="pr-feedback" role="alert"><b>Pull requests could not be loaded</b><span>{getPullRequestErrorMessage(list.error)}</span><Button kind="secondary" onClick={list.retry}>Retry</Button></div>}
          {list.status === 'success' && visiblePullRequests.length === 0 && <div className="pr-feedback"><b>{search ? 'No matching pull requests' : 'No pull requests in this view'}</b><span>{search ? 'Try a different search.' : stateFilter === 'merged' || stateFilter === 'closed' ? 'Load another page to search older pull requests.' : 'GitHub returned no pull requests for this repository and filter.'}</span></div>}
          {list.status === 'success' && visiblePullRequests.map((pullRequest) => <button type="button" className={`pr-card ${selectedPull?.number === pullRequest.number ? 'selected' : ''}`} key={pullRequest.number} onClick={() => { setSelectedNumber(pullRequest.number); saveCodeReviewSelection(getWorkspaceSessionStorage(), { repositoryId: String(selectedRepository.id), pullNumber: pullRequest.number, stateFilter }) }} aria-pressed={selectedPull?.number === pullRequest.number}>
            <div className="pr-card-meta"><span>#{pullRequest.number}</span><span className={`pr-status-pill ${pullRequest.merged ? 'merged' : pullRequest.state}`}>{getPullRequestStatus(pullRequest)}</span></div><b>{pullRequest.title}</b><small>{pullRequest.author ? `by ${pullRequest.author}` : 'Author unavailable'}</small><div className="pr-card-bottom"><span>{pullRequest.changedFiles === null ? 'Changed files unavailable' : `${pullRequest.changedFiles} changed files`}</span><time>{formatPullRequestDate(pullRequest.updatedAt)}</time></div>
          </button>)}
          {list.status === 'success' && list.hasNext && <div className="pr-load-more"><Button kind="secondary" disabled={list.loadingMore} onClick={list.loadMore}>{list.loadingMore ? 'Loading…' : 'Load more pull requests'}</Button>{list.loadMoreError && <span role="alert">{getPullRequestErrorMessage(list.loadMoreError)} <button onClick={list.loadMore}>Retry</button></span>}</div>}
        </section>
        <section className="panel review-detail pr-detail-panel">
          {!selectedPull ? <div className="pr-feedback"><Icon name="review" size={22}/><b>Select a pull request</b><span>Its GitHub metadata and changed files will appear here.</span></div> : <PullRequestDetail selectedPull={selectedPull} details={details} repository={selectedRepository}/>}
        </section>
      </div>}
    </section>
    <div className="live-data-note"><Icon name="github" size={14}/> Pull request data comes from the GitHub App installation linked to your NEBULITH account. Descriptions, filenames and diffs are displayed as plain text.</div>
  </>
}

function PullRequestDetail({ selectedPull, details, repository }) {
  const pullRequest = details.pullRequest || selectedPull
  const reviewJobs = useCodeReviews(repository, pullRequest)
  return <>
    <div className="review-detail-head"><div><span className="eyebrow">{selectedPull.number ? `#${selectedPull.number}` : ''} · {getPullRequestStatus(pullRequest)}</span><h2>{pullRequest.title}</h2><p>{pullRequest.author ? `Opened by ${pullRequest.author}` : 'Author unavailable'} · Updated {formatPullRequestDate(pullRequest.updatedAt)}</p></div>{pullRequest.url && <a className="quiet-button github-pr-link" href={pullRequest.url} target="_blank" rel="noopener noreferrer">Open on GitHub <Icon name="external" size={13}/></a>}</div>
    {details.detailStatus === 'loading' && <div className="pr-detail-loading" role="status"><i/><i/><i/></div>}
    {details.detailStatus === 'error' && <div className="pr-inline-error" role="alert"><span>{getPullRequestErrorMessage(details.detailError)}</span><Button kind="secondary" onClick={details.retry}>Retry details</Button></div>}
    {details.detailStatus === 'success' && <>
      <div className="pr-metadata"><span>{pullRequest.baseBranch || 'base unavailable'} ← {pullRequest.headBranch || 'head unavailable'}</span>{pullRequest.additions !== null && <span className="diff-add-count">+{pullRequest.additions}</span>}{pullRequest.deletions !== null && <span className="diff-remove-count">−{pullRequest.deletions}</span>}{pullRequest.changedFiles !== null && <span>{pullRequest.changedFiles} files changed</span>}</div>
      <div className="pr-description"><h3>Description</h3>{pullRequest.body ? <p>{pullRequest.body}</p> : <span>No description provided.</span>}{pullRequest.bodyTruncated && <small>Description preview was shortened for display.</small>}</div>
    </>}
    <ReviewJobPanel state={reviewJobs} pullRequest={pullRequest}/>
    <div className="pr-files-heading"><div><h3>Changed files</h3><span>{details.filesStatus === 'success' ? `${details.files.length} shown${details.hasNext ? ' · more available' : ''}` : 'Read-only GitHub diff preview'}</span></div></div>
    {details.filesStatus === 'loading' && <div className="pr-feedback" role="status"><span className="pr-spinner"/>Loading changed files…</div>}
    {details.filesStatus === 'error' && <div className="pr-inline-error" role="alert"><span>{getPullRequestErrorMessage(details.filesError)}</span><Button kind="secondary" onClick={details.retry}>Retry files</Button></div>}
    {details.filesStatus === 'success' && details.files.length === 0 && <div className="pr-feedback"><b>No changed files</b><span>GitHub returned no changed files for this pull request.</span></div>}
    {details.filesStatus === 'success' && details.files.map((file) => <PullRequestFile key={`${file.previousFilename || ''}:${file.filename}`} file={file}/>)}
    {details.filesStatus === 'success' && details.hasNext && <div className="pr-load-more"><Button kind="secondary" disabled={details.loadingMore} onClick={details.loadMoreFiles}>{details.loadingMore ? 'Loading files…' : 'Load more files'}</Button>{details.loadMoreError && <span role="alert">{getPullRequestErrorMessage(details.loadMoreError)} <button onClick={details.loadMoreFiles}>Retry</button></span>}</div>}
  </>
}

function ReviewJobPanel({ state, pullRequest }) {
  const newest = state.reviews[0]
  const eligible = pullRequest.state === 'open' && !state.active
  const needsExplicitRerun = newest && ['completed', 'failed', 'stale', 'cancelled'].includes(newest.status)
  return <section className="review-job-panel" aria-label="Internal review job">
    <div className="review-job-heading"><div><span className="eyebrow">V5.2 REVIEW INFRASTRUCTURE</span><h3>Internal review processing</h3><p>This verifies job handling only. No AI analysis or GitHub action runs.</p></div>
      <Button kind="secondary" disabled={!eligible || state.submitting || state.status === 'loading'} onClick={() => state.request(Boolean(needsExplicitRerun))}>{state.submitting ? 'Submitting…' : needsExplicitRerun ? 'Request another run' : 'Request review'}</Button>
    </div>
    {state.status === 'loading' && <div className="review-job-message" role="status">Loading review history…</div>}
    {state.status === 'error' && <div className="review-job-message" role="alert">Review history could not be loaded. <button type="button" onClick={state.reload}>Retry</button></div>}
    {state.actionError && <div className="review-job-message review-job-error" role="alert">{state.actionError.message || 'The review action could not be completed.'}</div>}
    {state.status === 'success' && state.reviews.length === 0 && <div className="review-job-message">No internal review jobs have been requested for this pull request.</div>}
    {state.reviews.map((review) => <div className="review-job-row" key={review._id}>
      <span className={`review-job-status ${review.status}`}>{review.status}</span><span>Revision <code>{String(review.headSha || '').slice(0, 8)}</code></span><time>{formatPullRequestDate(review.createdAt)}</time>
      {review.status === 'completed' && <p className="review-job-notice">{review.resultNotice || 'Infrastructure processing completed. No AI analysis was performed.'}</p>}
      {review.failureCode && <p className="review-job-notice">Processing could not complete ({review.failureCode}).</p>}
      {review.status === 'failed' && <button type="button" onClick={() => state.retry(review._id)} disabled={state.submitting}>Retry</button>}
      {review.status === 'stale' && <span className="review-job-notice">The pull request changed; request a run for its current revision.</span>}
      {review.status === 'queued' && <button type="button" onClick={() => state.cancel(review._id)} disabled={state.submitting}>Cancel</button>}
      {review.status === 'running' && <button type="button" onClick={() => state.cancel(review._id)} disabled={state.submitting}>Request cancellation</button>}
    </div>)}
  </section>
}

function PullRequestFile({ file }) {
  const diffLines = typeof file.patch === 'string' ? file.patch.split('\n') : []
  return <details className="pr-file"><summary><span className="pr-file-chevron"><Icon name="chevron" size={13}/></span><span className="pr-file-title"><b>{file.filename}</b>{file.previousFilename && file.previousFilename !== file.filename && <small>renamed from {file.previousFilename}</small>}<small>{file.status}{!file.patchAvailable ? ' · patch not provided by GitHub' : file.patchTruncated ? (file.patchOmittedByLimit ? ' · patch omitted by response size limit' : ' · patch preview truncated') : ''}</small></span><span className="diff-add-count">+{file.additions ?? '—'}</span><span className="diff-remove-count">−{file.deletions ?? '—'}</span></summary>
    {file.url && <div className="pr-file-actions"><a href={file.url} target="_blank" rel="noopener noreferrer">Open file on GitHub <Icon name="external" size={12}/></a></div>}
    {file.patchAvailable && file.patch ? <pre className="pr-diff" aria-label={`Diff for ${file.filename}`}>{diffLines.map((line, index) => {
      const className = line.startsWith('+') && !line.startsWith('+++') ? 'diff-line-added'
        : line.startsWith('-') && !line.startsWith('---') ? 'diff-line-removed'
          : line.startsWith('@@') ? 'diff-line-hunk' : ''
      return <span className={className} key={`${index}:${line}`}>{line || ' '}{'\n'}</span>
    })}</pre> : file.patchOmittedByLimit ? <div className="pr-missing-patch">The text patch was omitted because this page reached NEBULITH’s response-size limit.</div> : <div className="pr-missing-patch">GitHub did not provide a text patch for this file. It may be binary, too large or otherwise unavailable.</div>}
  </details>
}

function Analytics() {
  const [range,setRange] = useState('Last 7 days')
  return <><PageHeader eyebrow="PATTERNS, NOT JUST NUMBERS" title="Analytics" detail="A preview of how repository and engineering signals could come together." action={<select className="range-select" value={range} onChange={(e)=>setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select>}/><div className="prototype-banner"><Icon name="spark" size={14}/> Analytics on this page use illustrative sample data; live GitHub repository totals are shown on Overview.</div><div className="analytics-metrics"><StatCard label="Contributions · sample" value={range==='Last 7 days'?'186':range==='Last 30 days'?'742':'2,184'} delta="Illustrative data" icon="chart" tone="violet"/><StatCard label="Active repositories · sample" value="18" delta="Illustrative data" icon="repo" tone="cyan"/><StatCard label="Avg. review time · sample" value="4.2h" delta="Illustrative data" icon="clock" tone="green"/><StatCard label="Merged PRs · sample" value="32" delta="Illustrative data" icon="check" tone="amber"/></div><div className="analytics-grid"><section className="panel analytics-activity"><div className="panel-heading"><div><h2>Contribution activity</h2><p>Daily contributions · {range.toLowerCase()} · sample data</p></div><span className="chart-legend"><i/> Sample contributions</span></div><ActivityChart/></section><section className="panel analytics-language"><div className="panel-heading"><div><h2>Language distribution</h2><p>Illustrative sample data</p></div></div><LanguageChart/><div className="language-legend">{languages.map((lang)=><div key={lang.name}><span><i style={{background:lang.color}}/>{lang.name}</span><b>{lang.percent}%</b></div>)}</div></section></div><section className="panel repo-activity-panel"><div className="panel-heading"><div><h2>Repository activity · sample</h2><p>Illustrative events, not live GitHub activity</p></div></div>{sampleRepositories.slice(0,4).map((repo,i)=><div className="repo-activity-row" key={repo.name}><div className="repo-activity-name"><span className="repo-symbol"><Icon name="repo" size={15}/></span><span><b>{repo.name}</b><small>{repo.visibility} sample repository</small></span></div><div className="activity-bar"><i style={{width:`${[86,69,54,42][i]}%`}}/></div><b className="activity-count">{[48,37,29,22][i]} <small>sample events</small></b><span className="trend-up">↗ {['18%','12%','8%','4%'][i]}</span></div>)}</section></>
}

function Settings({ user, repositoryStatus }) {
  const [toggles,setToggles]=useState({weekly:true,review:false,compact:false})
  const [activeSection,setActiveSection]=useState('profile')
  const toggle=(name)=>setToggles((current)=>({...current,[name]:!current[name]}))
  const settingsSections=[['profile','Profile'],['integrations','Integrations'],['appearance','Appearance'],['notifications','Notifications']]
  const displayName = user?.name || user?.email || 'Developer'
  const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'N'
  const githubConnected = repositoryStatus === 'success'
  return <><PageHeader eyebrow="MAKE IT YOURS" title="Settings" detail="A few preferences for your NEBULITH workspace."/><div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{settingsSections.map(([id,label])=><button key={id} className={activeSection===id?'active':''} onClick={()=>{setActiveSection(id);document.getElementById(`settings-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'})}}>{label}</button>)}</nav><div className="settings-panels"><section id="settings-profile" className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Profile information</h2><p>Your personal details in this workspace</p></div><button className="quiet-button" onClick={()=>window.alert('Profile editing is a visual prototype.')}>Edit profile</button></div><div className="profile-settings-row"><div className="settings-avatar">{initials}</div><div><b>{displayName}</b><span>{user?.email}</span></div></div><div className="settings-field-grid"><label>Display name<input value={user?.name || ''} readOnly/></label><label>Email address<input value={user?.email || ''} readOnly/></label></div></section><section id="settings-integrations" className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Connected accounts</h2><p>GitHub App repository access status</p></div></div><div className="integration-row"><span className="integration-mark"><Icon name="github"/></span><div><b>GitHub</b><span>{githubConnected ? 'Repository access verified through the linked installation.' : repositoryStatus === 'error' ? 'Repository access could not be verified.' : 'Checking repository access…'}</span></div><span className={`connected-status ${githubConnected ? '' : 'integration-disconnected'}`}><i/> {githubConnected ? 'Connected' : repositoryStatus === 'error' ? 'Unavailable' : 'Checking'}</span></div></section><section id="settings-appearance" className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Appearance</h2><p>Keep your workspace easy on the eyes</p></div></div><Preference title="Compact repository rows" detail="Show more repositories in the same space." checked={toggles.compact} onChange={()=>toggle('compact')}/><Preference title="Reduce motion" detail="Use calmer transitions throughout the prototype." checked={false} onChange={()=>window.alert('Motion preference is preview only.')}/></section><section id="settings-notifications" className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Notifications</h2><p>Choose what you hear about and when</p></div></div><Preference title="Weekly workspace digest" detail="A thoughtful summary of your repositories and team activity." checked={toggles.weekly} onChange={()=>toggle('weekly')}/><Preference title="Review activity notifications" detail="Updates when a pull request needs your attention." checked={toggles.review} onChange={()=>toggle('review')}/></section><div className="demo-disclaimer"><Icon name="spark" size={14}/> Settings are interactive previews and are not saved to an account.</div></div></div></>
}

function Preference({title,detail,checked,onChange}) {
  return <div className="preference-row"><div><b>{title}</b><span>{detail}</span></div><button role="switch" aria-checked={checked} className={`toggle ${checked?'on':''}`} onClick={onChange} aria-label={title}><i/></button></div>
}

function RepositoryModal({ repo, close, commitIntelligence }) {
  useEffect(() => {
    if (!repo) return undefined
    const handleKeydown = (event) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [repo, close])

  if (!repo) return null
  const githubUrl = getSafeGithubUrl(repo.url)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)close()}}><section className="repo-modal" role="dialog" aria-modal="true" aria-labelledby="repo-modal-title"><button className="modal-close" onClick={close} aria-label="Close repository details"><Icon name="close"/></button><div className="modal-repo-icon"><Icon name="repo" size={21}/></div><span className="eyebrow">{repo.fullName}</span><h2 id="repo-modal-title">{repo.name}</h2><p>{repo.description || 'No description provided.'}</p><div className="modal-meta"><RepositoryVisibility visibility={repo.visibility}/>{repo.primaryLanguage&&<span>{repo.primaryLanguage}</span>}<span>✧ {formatCount(repo.stars)} stars</span><span>⑂ {formatCount(repo.forks)} forks</span></div><div className="repository-detail-facts"><div><span>Last updated</span><b>{formatRepositoryDate(repo.updatedAt)}</b></div>{repo.defaultBranch&&<div><span>Default branch</span><b>{repo.defaultBranch}</b></div>}</div><div className="modal-actions">{githubUrl&&<a className="button button-secondary modal-github" href={githubUrl} target="_blank" rel="noopener noreferrer"><Icon name="github" size={15}/> Open on GitHub <Icon name="external" size={13}/></a>}<button className="button button-secondary modal-done" onClick={close}>Done <Icon name="check" size={15}/></button></div><div className="repository-modal-commit-history"><CommitHistory intelligence={commitIntelligence} repositoryName={repo.fullName}/></div></section></div>
}

function getSafeGithubUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null
  } catch {
    return null
  }
}

function App() {
  const [page,setPage] = useState(() => readPageFromSearch(window.location.search))
  const [selectedRepo,setSelectedRepo] = useState(null)
  const [commitRepositoryId,setCommitRepositoryId] = useState(null)
  const [returnPage,setReturnPage] = useState('overview')
  const { user, status, authMessage, restoreError, storageWarning, logout, retrySession, clearMessages } = useAuth()
  const githubRepositories = useGithubRepositories(status === 'authenticated')
  const visiblePage = resolveVisiblePage({ page, status, authMessage, returnPage })
  const selectedCommitRepository = githubRepositories.repositories.find((repo) => String(repo.id) === String(commitRepositoryId))
    || githubRepositories.repositories[0]
    || null
  const commitIntelligence = useCommitIntelligence(
    status === 'authenticated'
      && Boolean(selectedCommitRepository)
      && (visiblePage === 'overview' || Boolean(selectedRepo)),
    selectedCommitRepository,
  )
  const languageIntelligence = useLanguageIntelligence(status === 'authenticated' && visiblePage === 'overview')
  const contributorIntelligence = useContributorIntelligence(
    status === 'authenticated' && visiblePage === 'overview' && Boolean(selectedCommitRepository),
    selectedCommitRepository,
  )
  const navigate=(next)=>{
    const target = resolveNavigationTarget(next, status)
    const destination = target.page
    if (target.returnPage) setReturnPage(target.returnPage)
    setPage(destination)
    const nextUrl = `${window.location.pathname}${searchWithPage(window.location.search, destination)}${window.location.hash}`
    window.history.pushState({ page: destination }, '', nextUrl)
    window.scrollTo({top:0,behavior:'smooth'})
  }
  useEffect(() => {
    const syncLocation = () => {
      const requestedPage = readPageFromSearch(window.location.search)
      if (status !== 'checking' && status !== 'unavailable' && WORKSPACE_PAGES.includes(requestedPage) && status !== 'authenticated') {
        setReturnPage(requestedPage)
        setPage('login')
        const loginUrl = `${window.location.pathname}${searchWithPage(window.location.search, 'login')}${window.location.hash}`
        window.history.replaceState({ page: 'login' }, '', loginUrl)
      } else setPage(requestedPage)
    }
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [status])
  useEffect(() => {
    if (status !== 'anonymous' || !WORKSPACE_PAGES.includes(page)) return
    if (readPageFromSearch(window.location.search) === 'login') return
    const loginUrl = `${window.location.pathname}${searchWithPage(window.location.search, 'login')}${window.location.hash}`
    window.history.replaceState({ page: 'login' }, '', loginUrl)
  }, [page, status])
  const handleLogout = () => {
    logout()
    setSelectedRepo(null)
    setPage('landing')
    const landingUrl = `${window.location.pathname}${searchWithPage(window.location.search, 'landing')}${window.location.hash}`
    window.history.replaceState({ page: 'landing' }, '', landingUrl)
  }
  const openRepository = (repository) => {
    setCommitRepositoryId(repository.id)
    setSelectedRepo(repository)
  }
  if (status === 'checking') return <AuthLoadingScreen/>
  if (status === 'unavailable') return <SessionRecovery message={restoreError} retrySession={retrySession} isChecking={false} onSignIn={() => { logout(); clearMessages(); setPage('login') }}/>
  if(visiblePage==='landing') return <Landing navigate={navigate}/>
  if(visiblePage==='login'||visiblePage==='register') return <AuthPage mode={visiblePage} navigate={navigate}/>
  if (status !== 'authenticated') return <AuthPage mode="login" navigate={navigate}/>
  let view
  if(visiblePage==='overview') view=<Overview navigate={navigate} openRepo={openRepository} user={user} repositories={githubRepositories.repositories} repositoryStatus={githubRepositories.status} repositoryError={githubRepositories.error} retryRepositories={githubRepositories.retry} selectedCommitRepository={selectedCommitRepository} onSelectCommitRepository={setCommitRepositoryId} commitIntelligence={commitIntelligence} languageIntelligence={languageIntelligence} contributorIntelligence={contributorIntelligence}/>
  else if(visiblePage==='repositories') view=<Repositories repositories={githubRepositories.repositories} status={githubRepositories.status} error={githubRepositories.error} retry={githubRepositories.retry} openRepo={openRepository}/>
  else if(visiblePage==='code-reviews') view=<Reviews repositories={githubRepositories.repositories} repositoryStatus={githubRepositories.status} repositoryError={githubRepositories.error} retryRepositories={githubRepositories.retry}/>
  else if(visiblePage==='analytics') view=<Analytics/>
  else view=<Settings user={user} repositoryStatus={githubRepositories.status}/>
  return <><AppShell page={visiblePage} navigate={navigate} user={user} onLogout={handleLogout} storageWarning={storageWarning} repositoryStatus={githubRepositories.status} repositoryError={githubRepositories.error}>{view}</AppShell><RepositoryModal repo={selectedRepo} close={()=>setSelectedRepo(null)} commitIntelligence={commitIntelligence}/></>
}

export default App
