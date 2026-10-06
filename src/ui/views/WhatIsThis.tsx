import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './common.tsx';

const TABS = [
  { id: 'about', label: 'What is this?' },
  { id: 'guide', label: 'How to interact' },
  { id: 'changes', label: 'Changelog' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** A native modal keeps focus inside the guide and makes the workspace behind it inert. */
export function WhatIsThis({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('about');
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    element.showModal();
    document.documentElement.style.overflow = 'hidden';
    title.current?.focus();
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus();
      else document.getElementById('what-is-this-button')?.focus();
    };
  }, []);

  useEffect(() => { body.current?.scrollTo(0, 0); }, [tab]);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    const index = TABS.findIndex((item) => item.id === current);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next].id;
    setTab(target);
    tabButtons.current[target]?.focus();
  }

  return (
    <dialog
      ref={dialog}
      id="what-is-this"
      className="welcome panel"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        // Backdrop clicks target the dialog itself; clicks on its padding stay inside.
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
    >
      <div className="welcome-head">
        <div>
          <p className="welcome-eyebrow mono">A guide to Iceland Inc.</p>
          <h2 ref={title} id={`${id}-title`} tabIndex={-1}>What is this?</h2>
          <p id={`${id}-description`} className="muted">An explorable economy. Follow the money, change a setting, see what happens.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close introduction" onClick={onClose}><Icon name="close" /></button>
      </div>

      <div className="welcome-tabs" role="tablist" aria-label="Introduction and help">
        {TABS.map((item) => (
          <button
            key={item.id}
            ref={(element) => { tabButtons.current[item.id] = element; }}
            type="button"
            role="tab"
            id={`${id}-tab-${item.id}`}
            aria-controls={`${id}-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={`welcome-tab ${tab === item.id ? 'on' : ''}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => onTabKey(event, item.id)}
          >{item.label}</button>
        ))}
      </div>

      <div ref={body} className="welcome-body scroll">
        <section className="welcome-tabpanel" id={`${id}-panel-about`} role="tabpanel" aria-labelledby={`${id}-tab-about`} tabIndex={0} hidden={tab !== 'about'}>
          <h3>See the economy as a connected system.</h3>
          <p>Iceland Inc. is an interactive teaching simulation of money flowing between households, firms, banks, government, pension funds and the rest of the world. A change in one place travels through the others, month by month.</p>
          <div className="welcome-cards">
            <div><span className="welcome-number mono">01</span><h4>Follow the money</h4><p>Open a group on the map. Click a flow or a player to see the transactions, balance sheets and rules behind it.</p></div>
            <div><span className="welcome-number mono">02</span><h4>Try an experiment</h4><p>Move a lever: interest rates, public spending, wages or lending. Watch how the rest of the economy responds.</p></div>
            <div><span className="welcome-number mono">03</span><h4>Understand the effect</h4><p>Use the charts and Inspector to connect the result to the assumptions and economic ideas that produced it.</p></div>
          </div>
          <div className="welcome-note">
            <h4>A model for learning</h4>
            <p>Every payment has a payer and a receiver, but how people respond depends on the model’s assumptions. These experiments are illustrations, not forecasts of Iceland’s economy. The Inspector explains the rules and assumptions behind each result.</p>
          </div>
          <button type="button" className="btn" onClick={() => { setTab('guide'); tabButtons.current.guide?.focus(); }}>Show me the controls <Icon name="forward" /></button>
        </section>

        <section className="welcome-tabpanel" id={`${id}-panel-guide`} role="tabpanel" aria-labelledby={`${id}-tab-guide`} tabIndex={0} hidden={tab !== 'guide'}>
          <h3>Your first experiment</h3>
          <p>Start with one small change, then follow it through the economy.</p>
          <ol className="welcome-steps">
            <li><h4>Explore the flow map</h4><p>Click a group card to open its members. Click a player or a connecting pipe to inspect it. <strong>Expand all</strong> and <strong>Collapse all</strong> change the level of detail; <strong>Ledger</strong> shows the same transactions in a table.</p></li>
            <li><h4>Move a lever</h4><p>Open a section in <strong>Levers</strong>, then use the slider or − / + buttons. A change starts the clock. A one-off shock takes effect when you press its <strong>Apply now</strong> button.</p></li>
            <li><h4>Choose who sets policy</h4><p>An open padlock lets that lever follow its policy rule. Moving it takes control and closes the padlock. A closed padlock holds your setting; open it to hand control back to the rule.</p></li>
            <li><h4>Control the clock</h4><p><strong>Play / Pause</strong> runs or stops time. <strong>Step one month</strong> advances one month, and <strong>1× / 3× / 6×</strong> changes the speed. Press <kbd>Space</kbd> to play or pause when focus is outside a control.</p></li>
            <li><h4>Read the result</h4><p>Switch chart groups and click a chart to inspect its drivers. Read each chart’s units and comparison label to understand the change. <strong>Ideas at play</strong> explains the concepts behind the changes.</p></li>
            <li><h4>Revisit, reset or share</h4><p>Drag the timeline to revisit months already simulated. <strong>Reset</strong> clears all lever changes and returns to the start. <strong>Share scenario</strong> copies a link that replays your experiment.</p></li>
          </ol>
        </section>

        <section className="welcome-tabpanel" id={`${id}-panel-changes`} role="tabpanel" aria-labelledby={`${id}-tab-changes`} tabIndex={0} hidden={tab !== 'changes'}>
          <h3>What’s changed</h3>
          <p>The main changes you can explore in this build.</p>
          <div className="welcome-changelog">
            <article><span className="welcome-eyebrow mono"><time dateTime="2026-10-07">7 Oct 2026</time></span><h4>A clearer way to get started</h4><ul><li>A first-visit introduction with a guide to the map, levers, clock and charts.</li><li>Reopen this guide and changelog anytime from the <strong>?</strong> icon in the header.</li></ul></article>
            <article><span className="welcome-eyebrow mono"><time dateTime="2026-10-02">2 Oct 2026</time></span><h4>Your policy setting stays yours</h4><ul><li>Locked policy levers hold your setting while the economy responds.</li><li>Open the padlock to let the rule take over again.</li></ul></article>
            <article><span className="welcome-eyebrow mono"><time dateTime="2026-09-30">30 Sep 2026</time></span><h4>Explore the economy from the inside</h4><ul><li>Expandable groups, exact transaction flows, balance sheets and a live ledger.</li><li>Explained rules and economic ideas, with replayable scenario links.</li></ul></article>
          </div>
        </section>
      </div>

      <div className="welcome-footer">
        <span className="muted small">Reopen anytime from the ? icon in the header.</span>
        <button type="button" className="btn welcome-start" onClick={onClose}>Explore the economy <Icon name="forward" /></button>
      </div>
    </dialog>
  );
}
