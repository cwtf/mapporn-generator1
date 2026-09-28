'use client';
import { History, Plus, Trash2, MessageSquare, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import type { SavedChat } from '@/lib/chat-history';
export default function ChatHistory({
  chats,
  activeId,
  busy,
  error,
  onOpen,
  onNew,
  onDelete,
  onDeleteAll,
}: {
  chats: SavedChat[];
  activeId: string | null;
  busy: boolean;
  error: string;
  onOpen: (chat: SavedChat) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deletion, setDeletion] = useState<{ id: string; title: string } | 'all' | null>(null);
  return (
    <>
      <div className="chat-history-bar">
        <button className="text-button" disabled={busy} onClick={() => setOpen(true)}>
          <History size={15} /> Chat history <span className="history-count">{chats.length}</span>
        </button>
        <button className="text-button" disabled={busy} onClick={onNew}>
          <Plus size={15} /> New chat
        </button>
      </div>
      {error && (
        <p className="history-error" role="alert">
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="history-dialog">
          <DialogTitle>Chat history</DialogTitle>
          <DialogDescription>
            Saved in this browser. Open a chat to restore its conversation and map.
          </DialogDescription>
          <div className="history-dialog-actions">
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => {
                onNew();
                setOpen(false);
              }}
            >
              <Plus size={15} /> New chat
            </button>
            <button
              className="text-button danger-text"
              disabled={busy || !chats.length}
              onClick={() => setDeletion('all')}
            >
              <Trash2 size={14} /> Delete all
            </button>
          </div>
          <div className="history-list">
            {chats.length ? (
              chats.map((chat) => (
                <div
                  className={`history-row ${chat.id === activeId ? 'active' : ''}`}
                  key={chat.id}
                >
                  <button
                    className="history-open"
                    disabled={busy}
                    aria-label={`Open chat: ${chat.title}`}
                    onClick={() => {
                      onOpen(chat);
                      setOpen(false);
                    }}
                  >
                    <MessageSquare size={17} />
                    <span>
                      <strong>{chat.title}</strong>
                      <small>
                        {new Date(chat.updatedAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}{' '}
                        · {chat.map.projection}
                      </small>
                    </span>
                    {chat.id === activeId && <Check size={15} aria-label="Current chat" />}
                  </button>
                  <button
                    className="icon-button danger-text"
                    disabled={busy}
                    title="Delete chat"
                    aria-label={`Delete chat: ${chat.title}`}
                    onClick={() => setDeletion({ id: chat.id, title: chat.title })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <div className="history-empty">
                <History size={28} />
                <p>No saved chats yet</p>
                <span>Start a conversation or edit the map to save your first chat.</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deletion !== null}
        onOpenChange={(value) => {
          if (!value) setDeletion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {deletion === 'all' ? 'Delete all chats?' : 'Delete this chat?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deletion === 'all'
              ? 'All saved conversations and their maps will be removed from this browser. This cannot be undone.'
              : `“${deletion?.title || ''}” and its saved map will be removed from this browser. This cannot be undone.`}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deletion === 'all') onDeleteAll();
                else if (deletion) onDelete(deletion.id);
                setDeletion(null);
              }}
            >
              {' '}
              {deletion === 'all' ? 'Delete all chats' : 'Delete chat'}{' '}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
