import { useState } from 'react'
import { X, Search, Check, Music2 } from 'lucide-react'
import { useLibraryStore } from '../../store/store'

export default function CreatePlaylistModal({ onClose }) {
    const { songs, createPlaylist } = useLibraryStore()
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [selectedSongIds, setSelectedSongIds] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedEmoji, setSelectedEmoji] = useState('🎵')

    const emojis = ['🎵', '🎶', '🎸', '🎹', '🥁', '🎷', '🎺', '🎻', '🎤', '🌊', '🌙', '🌅', '🔥', '💎', '⚡', '🌈']

    const filteredSongs = songs.filter(song =>
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (song.album || '').toLowerCase().includes(searchQuery.toLowerCase())
    )

    const toggleSong = (songId) => {
        setSelectedSongIds(prev =>
            prev.includes(songId) ? prev.filter(id => id !== songId) : [...prev, songId]
        )
    }

    const selectAll = () => {
        setSelectedSongIds(selectedSongIds.length === filteredSongs.length ? [] : filteredSongs.map(s => s.id))
    }

    const handleSave = () => {
        if (!name.trim()) return
        createPlaylist(name.trim(), description.trim(), selectedEmoji, selectedSongIds)
        onClose()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
            <div
                className="animate-fade-up"
                style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 500, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>New Playlist</h2>
                    <button className="btn-icon" onClick={onClose}><X size={20} /></button>
                </div>

                {/* Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                    <input type="text" placeholder="Playlist name..." value={name} onChange={e => setName(e.target.value)} className="s-input" autoFocus />
                    <input type="text" placeholder="Description (optional)..." value={description} onChange={e => setDescription(e.target.value)} className="s-input" />
                </div>

                {/* Emoji picker */}
                <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>Choose an icon:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {emojis.map(emoji => (
                            <button key={emoji} onClick={() => setSelectedEmoji(emoji)}
                                style={{
                                    width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', borderRadius: 8, cursor: 'pointer', transition: 'all 0.12s',
                                    border: selectedEmoji === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: selectedEmoji === emoji ? 'var(--accent-dim)' : 'transparent',
                                    transform: selectedEmoji === emoji ? 'scale(1.1)' : 'scale(1)',
                                }}
                            >{emoji}</button>
                        ))}
                    </div>
                </div>

                {/* Song search */}
                <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                    <input type="text" placeholder="Search songs to add..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="s-input" style={{ paddingLeft: '2rem' }} />
                </div>

                {/* Count + select all */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Music2 size={13} style={{ color: 'var(--text-subtle)' }} />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedSongIds.length} selected</span>
                    </div>
                    <button onClick={selectAll} className="btn-icon" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem', color: 'var(--accent-light)' }}>
                        {selectedSongIds.length === filteredSongs.length ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                {/* Song list */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 250, marginBottom: '1rem', paddingRight: 4 }}>
                    {filteredSongs.map(song => {
                        const sel = selectedSongIds.includes(song.id)
                        return (
                            <div key={song.id} onClick={() => toggleSong(song.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.45rem 0.65rem', borderRadius: 8, cursor: 'pointer', transition: 'background 0.12s',
                                    border: `1px solid ${sel ? 'var(--border-accent)' : 'var(--border)'}`,
                                    background: sel ? 'var(--accent-dim)' : 'transparent',
                                }}>
                                <div style={{
                                    width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                                    background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s',
                                }}>
                                    {sel && <Check size={12} color="#fff" />}
                                </div>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0, overflow: 'hidden' }}>
                                    {song.cover?.startsWith?.('http') ? <img src={song.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : song.cover || '🎵'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{song.artist}</div>
                                </div>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)' }}>{song.duration || ''}</span>
                            </div>
                        )
                    })}
                    {filteredSongs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>No songs found</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 4 }}>Try a different search</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.875rem', borderTop: '1px solid var(--border)' }}>
                    <button className="btn-ghost" onClick={onClose} style={{ fontSize: '0.82rem' }}>Cancel</button>
                    <button className="btn-accent" onClick={handleSave} disabled={!name.trim()} style={{ fontSize: '0.82rem', opacity: name.trim() ? 1 : 0.5 }}>Create Playlist</button>
                </div>
            </div>
        </div>
    )
}
