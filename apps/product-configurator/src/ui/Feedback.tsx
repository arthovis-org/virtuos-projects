import { publicPageUrl } from '@/desktop';
import { MessageSquare, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { recentErrors } from '@/feedback/errorLog';
import { useProduct, useSetupStore } from '@/state/setupStore';
import { currentDesk, deskName, workspaceById } from '@/state/setup';
import { shareSearch } from '@/state/shareLink';
import { useViewStore } from '@/state/viewStore';
import styles from './Feedback.module.css';

/** The feedback Worker (services/feedback-worker); without it there is no Feedback button. */
const ENDPOINT = import.meta.env.VITE_FEEDBACK_URL;
const KINDS = [
  { id: 'bug', label: 'Something’s wrong' },
  { id: 'idea', label: 'An idea' },
  { id: 'other', label: 'Other' },
] as const;
/** Longest side of an attached picture, in pixels: enough to read, small enough to send. */
const PICTURE_SIZE = 1600;

type Kind = (typeof KINDS)[number]['id'];
type Status = { state: 'editing'; error?: string } | { state: 'sending' } | { state: 'sent' };

/** Shrinks a picture to at most `PICTURE_SIZE` on its longest side, as a JPEG data URL. */
async function shrinkPicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PICTURE_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * The Feedback button and form. What is sent becomes an issue in the team's private feedback
 * repository, with what is needed to reproduce it: the exact link (the page keeps its whole
 * state in the URL), the view the visitor was in, their device and any recent errors.
 */
export function Feedback() {
  const product = useProduct();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [picture, setPicture] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ state: 'editing' });
  const honeypot = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    textarea.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!ENDPOINT) return null;

  /** What the visitor was looking at, in words. */
  const describeView = () => {
    const setup = useSetupStore.getState();
    const workspace = useViewStore.getState();
    const parts: string[] = [];
    if (setup.mode === 'desks') {
      const desk = currentDesk(setup);
      parts.push(
        `Unlimited desks (${setup.room.length})`,
        desk
          ? `at desk ${setup.room.indexOf(desk) + 1}, ${deskName(product, setup.room, desk)}`
          : 'overview',
      );
    } else {
      parts.push('One desk');
      if (workspace.active) {
        parts.push(`${workspaceById(product, setup.single.workspaceId)?.label ?? ''} workspace`);
      }
    }
    if (workspace.active || setup.mode === 'desks') {
      parts.push(
        workspace.seated
          ? workspace.focus
            ? `zoomed to ${workspace.focus}`
            : 'seated'
          : 'looking around',
      );
    }
    return parts.join(', ');
  };

  const describeDevice = () => {
    const touch = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    const shape = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
    return `${window.innerWidth}×${window.innerHeight} CSS px at ${window.devicePixelRatio}x, ${touch}, ${shape}`;
  };

  const choosePicture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setPicture(await shrinkPicture(file));
    } catch {
      setStatus({ state: 'editing', error: 'That picture could not be read' });
    }
  };

  const send = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setStatus({ state: 'editing', error: 'Write a few words first' });
      return;
    }
    setStatus({ state: 'sending' });
    try {
      const response = await fetch(`${ENDPOINT.replace(/\/$/, '')}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          message,
          name,
          screenshot: picture,
          website: honeypot.current?.value ?? '',
          context: {
            url: `${publicPageUrl()}${shareSearch()}`,
            view: describeView(),
            device: describeDevice(),
            userAgent: navigator.userAgent,
            time: new Date().toISOString(),
            errors: recentErrors(),
          },
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setStatus({ state: 'editing', error: result.error ?? 'Could not send; try again' });
        return;
      }
      setStatus({ state: 'sent' });
      setMessage('');
      setPicture(null);
    } catch {
      setStatus({ state: 'editing', error: 'Could not reach the server; check the connection' });
    }
  };

  const close = () => {
    setOpen(false);
    if (status.state === 'sent') setStatus({ state: 'editing' });
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback"
      >
        <MessageSquare size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.triggerLabel}>Feedback</span>
      </button>
      {open && (
        <div className={styles.backdrop} onClick={close}>
          <form
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void send(event)}
          >
            <div className={styles.head}>
              <h2 id="feedback-title" className={styles.title}>
                Feedback
              </h2>
              <button type="button" className={styles.close} aria-label="Close" onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {status.state === 'sent' ? (
              <div className={styles.sent}>
                <p className={styles.sentTitle}>Thank you, it’s on its way.</p>
                <p className={styles.note}>
                  The team sees it with a link to exactly what you were looking at.
                </p>
                <button type="button" className={styles.primary} onClick={close}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className={styles.kinds} role="radiogroup" aria-label="Kind of feedback">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={kind === k.id}
                      className={styles.kind}
                      onClick={() => setKind(k.id)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={textarea}
                  className={styles.message}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={
                    kind === 'bug'
                      ? 'What happened, and what did you expect?'
                      : 'What would you like?'
                  }
                  rows={5}
                  maxLength={5000}
                  aria-label="Message"
                />
                <input
                  className={styles.name}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={100}
                  aria-label="Your name (optional)"
                />
                {/* Hidden from people; bots fill it in, and the server drops them. */}
                <input
                  ref={honeypot}
                  className={styles.honeypot}
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />
                <div className={styles.attach}>
                  {picture ? (
                    <div className={styles.preview}>
                      <img src={picture} alt="Attached picture" />
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label="Remove the picture"
                        onClick={() => setPicture(null)}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <label className={styles.attachButton}>
                      <Paperclip size={15} strokeWidth={1.75} aria-hidden="true" />
                      Attach a screenshot
                      <input type="file" accept="image/*" onChange={(e) => void choosePicture(e)} />
                    </label>
                  )}
                </div>
                <p className={styles.note}>
                  Sent with a link to this exact view and your device type, so the team can see what
                  you see.
                </p>
                {status.state === 'editing' && status.error && (
                  <p className={styles.error} role="alert">
                    {status.error}
                  </p>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={status.state === 'sending'}
                  >
                    {status.state === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
