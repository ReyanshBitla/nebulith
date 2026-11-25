import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './experience.css'
import './authentication.css'
import './repositories.css'
import { activity, languages, pullRequests, repositories as sampleRepositories } from './data/demo'
import { useAuth } from './context/useAuth'
import { useGithubRepositories } from './context/useGithubRepositories'
import { getSafeAuthError } from './services/auth-errors'

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
    <div className="workspace-main"><header className="workspace-topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu"/></button><div className="breadcrumbs"><span>Northstar Studio</span><Icon name="chevron" size={13}/><b>{pageNames.find((n) => n.toLowerCase().replace(' ', '-') === page) || 'Overview'}</b></div><div className="topbar-actions"><span className="demo-badge" title="Repository listings are live; review, activity and productivity insights are sample data."><i/> LIVE + SAMPLE</span><button className="icon-button" aria-label="Notifications"><Icon name="bell"/></button><button className="topbar-avatar" onClick={() => go('settings')}>{initials}</button></div></header>{storageWarning&&<div className="storage-warning" role="status">{storageWarning}</div>}<main className="workspace-content">{children}</main><footer className="workspace-footer"><span>NEBULITH <i>·</i> A clearer view of your codebase</span><span>Repository data live · Insights sample</span></footer></div>
  </div>
}

function PageHeader({ eyebrow, title, detail, action, className = '' }) {
  return <div className={`page-header ${className}`}><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1>{detail&&<p>{detail}</p>}</div>{action}</div>
}

function Overview({ navigate, openRepo, user, repositories: liveRepositories, repositoryStatus, repositoryError, retryRepositories }) {
  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email || 'there'
  const stats = useMemo(() => liveRepositories.reduce((total, repo) => ({
    total: total.total + 1,
    public: total.public + (repo.visibility === 'public' ? 1 : 0),
    private: total.private + (repo.visibility === 'private' ? 1 : 0),
    stars: total.stars + (Number.isFinite(repo.stars) ? repo.stars : 0),
    forks: total.forks + (Number.isFinite(repo.forks) ? repo.forks : 0),
  }), { total: 0, public: 0, private: 0, stars: 0, forks: 0 }), [liveRepositories])
  const connected = repositoryStatus === 'success'
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
    ? 'Repository statistics below are live. Other workspace analytics remain sample data.'
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
    <div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Engineering pulse</h2><p>Contribution activity · sample data</p></div><select aria-label="Activity time range" defaultValue="7 days"><option>7 days</option><option>30 days</option><option>90 days</option></select></div><ActivityChart compact/></section><section className="panel language-panel"><div className="panel-heading"><div><h2>Language mix</h2><p>Illustrative distribution · sample data</p></div><span className="prototype-label">SAMPLE</span></div><LanguageChart/><div className="language-legend">{languages.map((language)=><div key={language.name}><span><i style={{background:language.color}}/>{language.name}</span><b>{language.percent}%</b></div>)}</div></section></div>
    <div className="dashboard-grid overview-lower-grid"><section className="panel repositories-panel"><div className="panel-heading"><div><h2>Your repositories</h2><p>{repositoryStatus === 'success' ? 'Live GitHub App data · select a repository for details.' : 'Live GitHub App repositories'}</p></div><button className="panel-link" onClick={() => navigate('repositories')}>All repositories <Icon name="arrow" size={14}/></button></div>{repositoryStatus === 'success' && liveRepositories.length > 0 ? <div className="overview-repo-grid">{liveRepositories.slice(0,4).map((repo)=><OverviewRepoCard key={repo.id} repo={repo} openRepo={openRepo}/>)}</div> : <RepositoryFeedback status={repositoryStatus} error={repositoryError} retry={retryRepositories} empty={repositoryStatus === 'success'}/>}</section><section className="panel activity-feed"><div className="panel-heading"><div><h2>Recent activity</h2><p>Sample workspace timeline</p></div><span className="prototype-label">SAMPLE</span></div><ActivityItem tone="violet" title="Review requested" detail="Sample event · PR #117" time="18m"/><ActivityItem tone="cyan" title="Repository indexed" detail="Sample event · repository" time="1h"/><ActivityItem tone="green" title="Pull request merged" detail="Sample event · PR #61" time="3h"/><ActivityItem tone="amber" title="Health score improved" detail="Sample event" time="Yesterday"/></section></div>
    <div className="dashboard-grid overview-insights-grid"><section className="panel code-summary-panel"><div className="panel-heading"><div><h2>Code review overview</h2><p>Sample pull request signals</p></div><button className="panel-link" onClick={() => navigate('code-reviews')}>Review queue <Icon name="arrow" size={14}/></button></div><div className="review-summary-meter"><div className="review-summary-ring"><strong>08</strong><span>OPEN</span></div><div className="review-summary-copy"><b>Moving at a healthy pace</b><span>3 ready · 3 in review · 2 need attention</span><div className="review-summary-bar"><i/></div></div></div><div className="review-summary-list"><span><i className="review-dot violet"/> In review <b>03</b></span><span><i className="review-dot green"/> Ready to merge <b>03</b></span><span><i className="review-dot amber"/> Needs attention <b>02</b></span></div></section><section className="panel productivity-panel"><div className="productivity-heading"><span className="productivity-icon"><Icon name="bolt" size={18}/></span><span className="section-index">TEAM MOMENTUM · SAMPLE</span></div><p>A little less waiting.<br/><strong>A little more making.</strong></p><div className="productivity-metrics"><div><span>AVG. REVIEW TIME</span><b>4.2h</b></div><div><span>WEEKLY MOMENTUM</span><b>+18%</b></div></div><div className="productivity-sparkline" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></section></div>
    <div className="demo-disclaimer"><Icon name="spark" size={14}/> Repository counts, visibility, stars and forks above come from GitHub. Review, productivity, activity and language panels are sample data.</div>
  </>
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

function ActivityItem({ tone, title, detail, time }) {
  return <div className="activity-item"><span className={`activity-marker ${tone}`}><i/></span><div><b>{title}</b><small>{detail}</small></div><time>{time}</time></div>
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

function Reviews() {
  const [selected, setSelected] = useState(pullRequests[1])
  const [filter, setFilter] = useState('All reviews')
  const visible = pullRequests.filter((pr)=>filter==='All reviews'||pr.status===filter)
  return <><PageHeader eyebrow="A BETTER SECOND LOOK" title="Code reviews" detail="A preview of how thoughtful, contextual reviews could feel." action={<span className="prototype-label"><Icon name="spark" size={13}/> PROTOTYPE</span>}/><div className="review-summary"><StatCard label="Open pull requests" value="08" delta="Across 4 repositories" icon="review" tone="violet"/><StatCard label="Ready to merge" value="03" delta="No blocking findings" icon="check" tone="green"/><StatCard label="Needs attention" value="02" delta="1 high severity finding" icon="bolt" tone="amber"/></div><div className="review-layout"><section className="panel pr-list"><div className="panel-heading"><div><h2>Pull requests</h2><p>Sample review queue</p></div><button className="quiet-icon" aria-label="More pull request options"><Icon name="more"/></button></div><div className="review-filter">{['All reviews','In review','Needs attention','Approved'].map((item)=><button key={item} className={filter===item?'selected':''} onClick={()=>setFilter(item)}>{item}</button>)}</div>{visible.map((pr)=><button className={`pr-card ${selected.id===pr.id?'selected':''}`} key={pr.id} onClick={()=>setSelected(pr)}><div className="pr-card-meta"><span>{pr.id}</span><span className={`severity ${pr.severity.toLowerCase().replace(' ','-')}`}>{pr.severity}</span></div><b>{pr.title}</b><small>{pr.repo} <i>·</i> by {pr.author}</small><div className="pr-card-bottom"><span className={`review-state ${pr.status.toLowerCase().replace(' ','-')}`}><i/>{pr.status}</span><time>{pr.time}</time></div></button>)}</section><section className="panel review-detail"><div className="review-detail-head"><div><span className="eyebrow">{selected.repo} {selected.id}</span><h2>{selected.title}</h2><p>Opened by {selected.author} <span>·</span> {selected.time}</p></div><button className="quiet-icon" aria-label="More review details"><Icon name="more"/></button></div><div className="review-ai-note"><span className="ai-spark"><Icon name="spark" size={17}/></span><div><b>Review preview</b><span>Illustrative insights only. No AI review has been run.</span></div></div><div className="code-review-block"><div className="code-file"><Icon name="code" size={15}/> src/auth/session.ts <span>+8 −2</span></div><pre><code><span className="code-muted">  41</span>  <span className="code-purple">export async function</span> refreshSession() {'{'}<br/><span className="code-muted">  42</span>    <span className="code-purple">const</span> session = <span className="code-blue">await</span> store.get();<br/><span className="code-muted">  43</span>    <span className="code-red">- if (session.expired) return null;</span><br/><span className="code-muted">  44</span>    <span className="code-green">+ if (!session || session.expired) return null;</span><br/><span className="code-muted">  45</span>    <span className="code-blue">return</span> refresh(session);<br/><span className="code-muted">  46</span>  {'}'}</code></pre></div><div className="finding-card"><span className="finding-icon"><Icon name="spark" size={16}/></span><div><div className="finding-title"><b>Guard against a missing session</b><span className="severity high">HIGH</span></div><p>Accessing <code>session.expired</code> may throw when no session is found. Consider checking for a missing value before reading its properties.</p><button onClick={()=>window.alert('This is an illustrative code review finding.')}>View suggestion <Icon name="arrow" size={13}/></button></div></div><div className="review-panel-foot"><span><i/> Example finding · illustrative only</span><button onClick={()=>window.alert('Review actions are not connected in this prototype.')}>Open pull request <Icon name="external" size={14}/></button></div></section></div></>
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

function RepositoryModal({ repo, close }) {
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
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)close()}}><section className="repo-modal" role="dialog" aria-modal="true" aria-labelledby="repo-modal-title"><button className="modal-close" onClick={close} aria-label="Close repository details"><Icon name="close"/></button><div className="modal-repo-icon"><Icon name="repo" size={21}/></div><span className="eyebrow">{repo.fullName}</span><h2 id="repo-modal-title">{repo.name}</h2><p>{repo.description || 'No description provided.'}</p><div className="modal-meta"><RepositoryVisibility visibility={repo.visibility}/>{repo.primaryLanguage&&<span>{repo.primaryLanguage}</span>}<span>✧ {formatCount(repo.stars)} stars</span><span>⑂ {formatCount(repo.forks)} forks</span></div><div className="repository-detail-facts"><div><span>Last updated</span><b>{formatRepositoryDate(repo.updatedAt)}</b></div>{repo.defaultBranch&&<div><span>Default branch</span><b>{repo.defaultBranch}</b></div>}</div><div className="modal-actions">{githubUrl&&<a className="button button-secondary modal-github" href={githubUrl} target="_blank" rel="noopener noreferrer"><Icon name="github" size={15}/> Open on GitHub <Icon name="external" size={13}/></a>}<button className="button button-secondary modal-done" onClick={close}>Done <Icon name="check" size={15}/></button></div></section></div>
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
  const [page,setPage] = useState('landing')
  const [selectedRepo,setSelectedRepo] = useState(null)
  const [returnPage,setReturnPage] = useState('overview')
  const { user, status, authMessage, restoreError, storageWarning, logout, retrySession, clearMessages } = useAuth()
  const githubRepositories = useGithubRepositories(status === 'authenticated')
  const workspacePages = ['overview', 'repositories', 'code-reviews', 'analytics', 'settings']
  const navigate=(next)=>{
    if (workspacePages.includes(next) && status !== 'authenticated') {
      setReturnPage(next)
      setPage('login')
    } else {
      setPage(next)
    }
    window.scrollTo({top:0,behavior:'smooth'})
  }
  const visiblePage = status === 'anonymous' && authMessage
    ? 'login'
    : status === 'authenticated' && (page === 'login' || page === 'register')
      ? returnPage
      : page
  const handleLogout = () => {
    logout()
    setSelectedRepo(null)
    setPage('landing')
  }
  if (status === 'checking') return <AuthLoadingScreen/>
  if (status === 'unavailable') return <SessionRecovery message={restoreError} retrySession={retrySession} isChecking={false} onSignIn={() => { logout(); clearMessages(); setPage('login') }}/>
  if(visiblePage==='landing') return <Landing navigate={navigate}/>
  if(visiblePage==='login'||visiblePage==='register') return <AuthPage mode={visiblePage} navigate={navigate}/>
  if (status !== 'authenticated') return <AuthPage mode="login" navigate={navigate}/>
  let view
  if(visiblePage==='overview') view=<Overview navigate={navigate} openRepo={setSelectedRepo} user={user} repositories={githubRepositories.repositories} repositoryStatus={githubRepositories.status} repositoryError={githubRepositories.error} retryRepositories={githubRepositories.retry}/>
  else if(visiblePage==='repositories') view=<Repositories repositories={githubRepositories.repositories} status={githubRepositories.status} error={githubRepositories.error} retry={githubRepositories.retry} openRepo={setSelectedRepo}/>
  else if(visiblePage==='code-reviews') view=<Reviews/>
  else if(visiblePage==='analytics') view=<Analytics/>
  else view=<Settings user={user} repositoryStatus={githubRepositories.status}/>
  return <><AppShell page={visiblePage} navigate={navigate} user={user} onLogout={handleLogout} storageWarning={storageWarning} repositoryStatus={githubRepositories.status} repositoryError={githubRepositories.error}>{view}</AppShell><RepositoryModal repo={selectedRepo} close={()=>setSelectedRepo(null)}/></>
}

export default App
