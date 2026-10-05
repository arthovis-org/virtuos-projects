import { Bookmark, Check, Link2, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { LAYOUTS_URL, layoutLink } from '@/layouts/layoutsApi';
import { useLayoutsStore } from '@/layouts/layoutsStore';
import styles from './Layouts.module.css';

/** Copies text; false where the browser doesn't allow it (the caller then shows the text). */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const formatDate = (time: number) =>
  new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Saved layouts: save the whole set-up (the single desk and the room of desks, every desk's
 * setup, height and windows) under a name, open it again later or on another device, and
 * share it by link. Layouts are stored online (services/layouts-worker); this browser keeps
 * the list of the ones it saved, with the keys that allow changing them.
 */
export function Layouts() {
  const mine = useLayoutsStore((s) => s.mine);
  const current = useLayoutsStore((s) => s.current);
  const saveNew = useLayoutsStore((s) => s.saveNew);
  const saveCurrent = useLayoutsStore((s) => s.saveCurrent);
  const open = useLayoutsStore((s) => s.open);
  const rename = useLayoutsStore((s) => s.rename);
  const remove = useLayoutsStore((s) => s.remove);
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!visible) return;
    nameInput.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!LAYOUTS_URL) return null;
  const currentIsMine = !!current && mine.some((l) => l.id === current.id);

  /** Runs an action, showing a message when it succeeds or why it failed. */
  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ text });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Something went wrong',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const onSaveNew = (event: SyntheticEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (!title) {
      setMessage({ text: 'Give the layout a name', error: true });
      return;
    }
    void run(async () => {
      const id = await saveNew(title);
      setName('');
      const copied = await copy(layoutLink(id));
      return copied
        ? `Saved “${title}”. Its link is copied.`
        : `Saved “${title}”. Its link: ${layoutLink(id)}`;
    });
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setMessage(null);
          setVisible(true);
        }}
        aria-label="Layouts"
        title="Save and open layouts"
      >
        <Bookmark size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.triggerLabel}>Layouts</span>
      </button>
      {visible && (
        <div className={styles.backdrop} onClick={() => setVisible(false)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="layouts-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.head}>
              <h2 id="layouts-title" className={styles.title}>
                Layouts
              </h2>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close"
                onClick={() => setVisible(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className={styles.note}>
              Saves everything: the desks, each desk’s setup and height, and the windows on every
              screen. Open it later on any device, or share its link.
            </p>

            {current && (
              <div className={styles.current}>
                <span className={styles.currentLabel}>Open now</span>
                <span className={styles.currentName}>{current.name}</span>
                <div className={styles.row}>
                  {currentIsMine && (
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await saveCurrent();
                          return `Saved the changes to “${current.name}”.`;
                        })
                      }
                    >
                      Save changes
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() =>
                      void run(async () =>
                        (await copy(layoutLink(current.id)))
                          ? 'Link copied.'
                          : layoutLink(current.id),
                      )
                    }
                  >
                    <Link2 size={14} aria-hidden="true" /> Copy link
                  </button>
                </div>
              </div>
            )}

            <form className={styles.save} onSubmit={onSaveNew}>
              <input
                ref={nameInput}
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name, e.g. Trading floor"
                maxLength={80}
                aria-label="Layout name"
              />
              <button type="submit" className={styles.primary} disabled={busy}>
                {current ? 'Save as new' : 'Save layout'}
              </button>
            </form>

            {message && (
              <p className={message.error ? styles.error : styles.success} role="status">
                {message.text}
              </p>
            )}

            <div className={styles.listHead}>Saved in this browser</div>
            {mine.length === 0 ? (
              <p className={styles.empty}>No layouts yet. Save one above.</p>
            ) : (
              <ul className={styles.list}>
                {mine.map((layout) => (
                  <li
                    key={layout.id}
                    className={styles.item}
                    data-current={current?.id === layout.id || undefined}
                  >
                    {renaming?.id === layout.id ? (
                      <form
                        className={styles.renameForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const next = renaming.name.trim();
                          if (!next) return;
                          void run(async () => {
                            await rename(layout.id, next);
                            setRenaming(null);
                            return undefined;
                          });
                        }}
                      >
                        <input
                          className={styles.input}
                          value={renaming.name}
                          onChange={(event) =>
                            setRenaming({ id: layout.id, name: event.target.value })
                          }
                          maxLength={80}
                          aria-label="New name"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className={styles.iconButton}
                          aria-label="Save the name"
                        >
                          <Check size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label="Cancel renaming"
                          onClick={() => setRenaming(null)}
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.open}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await open(layout.id);
                              setVisible(false);
                              return undefined;
                            })
                          }
                        >
                          <span className={styles.itemName}>{layout.name}</span>
                          <span className={styles.itemDate}>{formatDate(layout.updatedAt)}</span>
                        </button>
                        <div className={styles.itemActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={`Copy the link to ${layout.name}`}
                            title="Copy link"
                            onClick={() =>
                              void run(async () =>
                                (await copy(layoutLink(layout.id)))
                                  ? 'Link copied.'
                                  : layoutLink(layout.id),
                              )
                            }
                          >
                            <Link2 size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={`Rename ${layout.name}`}
                            title="Rename"
                            onClick={() => setRenaming({ id: layout.id, name: layout.name })}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          {confirmDelete === layout.id ? (
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await remove(layout.id);
                                  setConfirmDelete(null);
                                  return `Deleted “${layout.name}”.`;
                                })
                              }
                            >
                              Delete?
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.iconButton}
                              aria-label={`Delete ${layout.name}`}
                              title="Delete"
                              onClick={() => setConfirmDelete(layout.id)}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.note}>
              Anyone with a layout’s link can open it and save their own copy; only this browser can
              change or delete the layouts it saved.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
