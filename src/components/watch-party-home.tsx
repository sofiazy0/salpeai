"use client";

import {
  ArrowDownRight,
  ArrowRight,
  AudioLines,
  Clapperboard,
  Headphones,
  Link2,
  MessageCircle,
  MonitorPlay,
  Play,
  Radio,
  ScreenShare,
  Sparkles,
  Users,
  Video,
  Waves,
} from "lucide-react";

const features = [
  {
    icon: MonitorPlay,
    title: "Tudo em sincronia",
    description: "Dê play, pause ou avance. A experiência acompanha todo mundo, sem desencontro.",
  },
  {
    icon: AudioLines,
    title: "Vozes na mesma sala",
    description: "Converse durante o filme e compartilhe as reações em tempo real.",
  },
  {
    icon: Link2,
    title: "Um convite e pronto",
    description: "Uma sala compartilhada para reunir seus amigos sem complicação.",
  },
];

export function WatchPartyHome() {
  return (
    <main className="landing-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="site-nav">
        <a className="wordmark" href="#" aria-label="Salpeai, início">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span>salpeai<span className="wordmark-dot">.</span></span>
        </a>

        <nav className="nav-links" aria-label="Navegação principal">
          <a href="#experiencia">Experiência</a>
          <a href="#como-funciona">Como funciona</a>
        </nav>

        <a className="nav-cta glass-button" href="#como-funciona">
          Conhecer o projeto <ArrowUpRightIcon />
        </a>
      </header>

      <section className="hero-section" id="experiencia">
        <div className="hero-copy">
          <div className="status-pill">
            <span className="status-dot" />
            WATCH PARTY, DO SEU JEITO
            <Sparkles size={13} />
          </div>

          <h1>
            A distância
            <br />
            não precisa
            <br />
            <span className="gradient-text">pausar nada.</span>
          </h1>

          <p className="hero-description">
            Filmes, conversas e boas companhias. Uma sala virtual para dar play
            junto — mesmo quando cada pessoa está em um lugar.
          </p>

          <div className="hero-actions">
            <a className="primary-cta" href="#como-funciona">
              <Play size={16} fill="currentColor" />
              Descobrir a experiência
              <ArrowRight size={17} />
            </a>
            <a className="quiet-cta" href="#recursos">
              Explorar recursos <ArrowDownRight size={16} />
            </a>
          </div>

          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>m</span><span>l</span><span>j</span><span>+</span>
            </div>
            <div>
              <strong>Mais perto, mesmo de longe.</strong>
              <span>Feito para assistir em boa companhia.</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Prévia ilustrativa de uma sala de watch party">
          <div className="orbit orbit-large" />
          <div className="orbit orbit-small" />
          <div className="floating-chip chip-top"><Waves size={14} /> conexão estável</div>
          <div className="floating-chip chip-side"><Users size={14} /> 4 na sala</div>

          <div className="watch-window glass-panel">
            <div className="window-topbar">
              <div className="window-dots"><i /><i /><i /></div>
              <span className="room-label"><span className="live-dot" /> SALA PRIVADA</span>
              <span className="window-menu">•••</span>
            </div>

            <div className="movie-stage">
              <div className="stage-glow" />
              <div className="stage-content">
                <span className="stage-kicker">NOITE DE CINEMA</span>
                <span className="stage-title">stay<br />a little longer.</span>
                <span className="stage-subtitle">uma sessão entre amigos</span>
              </div>
              <button className="stage-play" type="button" aria-label="Prévia visual, sem reprodução">
                <Play size={18} fill="currentColor" />
              </button>
              <div className="stage-progress"><span /></div>
            </div>

            <div className="room-controls">
              <div className="now-playing">
                <span className="mini-poster"><Clapperboard size={17} /></span>
                <span><strong>Uma noite qualquer</strong><small>Reproduzindo em grupo</small></span>
              </div>
              <div className="control-icons" aria-hidden="true">
                <span><MessageCircle size={16} /></span>
                <span><Headphones size={16} /></span>
                <span className="control-play"><Play size={14} fill="currentColor" /></span>
              </div>
            </div>

            <div className="people-row">
              <div className="person"><span className="person-avatar avatar-lilac">M</span><span>marina</span><i className="speaking-bars"><b /><b /><b /></i></div>
              <div className="person"><span className="person-avatar avatar-blue">L</span><span>leo</span><i className="speaking-bars quiet"><b /><b /><b /></i></div>
              <div className="person"><span className="person-avatar avatar-peach">J</span><span>julia</span><i className="speaking-bars"><b /><b /><b /></i></div>
              <div className="person"><span className="person-avatar avatar-green">+</span><span>convidar</span></div>
            </div>
          </div>

          <div className="floating-note note-bottom"><span className="note-icon"><MessageCircle size={14} /></span><span><strong>todo mundo junto</strong><small>mesmo momento, outra cidade</small></span><span className="note-spark">✳</span></div>
        </div>
      </section>

      <section className="feature-strip" id="recursos">
        <div className="strip-intro">
          <span className="section-eyebrow">A EXPERIÊNCIA</span>
          <h2>Não é só assistir.<br /><span>É estar junto.</span></h2>
        </div>
        <div className="feature-list">
          {features.map(({ icon: Icon, title, description }, index) => (
            <article className="feature-card glass-panel" key={title} style={{ animationDelay: `${index * 100}ms` }}>
              <span className="feature-icon"><Icon size={19} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="feature-index">0{index + 1}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-panel glass-panel" id="como-funciona">
        <div className="closing-orb" aria-hidden="true" />
        <div>
          <span className="section-eyebrow">SALPEAI / WATCH TOGETHER</span>
          <h2>Escolha o filme.<br /><span>Chame a sua gente.</span></h2>
          <p>Uma nova forma de dividir a tela — e multiplicar os momentos.</p>
        </div>
        <div className="closing-mark"><Video size={26} /><span>em breve</span><Radio size={16} /></div>
      </section>

      <footer className="site-footer">
        <a className="wordmark footer-wordmark" href="#">
          <span className="brand-symbol"><i /><i /><i /></span>
          <span>salpeai<span className="wordmark-dot">.</span></span>
        </a>
        <span>Feito para compartilhar momentos.</span>
        <span className="footer-meta"><ScreenShare size={14} /> WATCH TOGETHER <span>© 2026</span></span>
      </footer>
    </main>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight className="arrow-diagonal" size={15} />;
}
