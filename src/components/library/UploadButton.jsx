import { useRef, useState } from 'react';
import { FolderOpen, Plus, AlertCircle, CheckCircle, X } from 'lucide-react';
import { useFolderPicker } from '../../hooks/useFolderPicker';
import { useFileUpload } from '../../hooks/useFileUpload';

export default function UploadButton() {
    const fileInputRef = useRef(null);
    const { uploadFiles, isUploading, progress: uploadProgress } = useFileUpload();
    const { pickFolder, isScanning, progress, error: folderError, isSupported } = useFolderPicker();

    const [toast, setToast]       = useState(null);
    const [dupAlert, setDupAlert] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleSelectFolder = async () => {
        setDupAlert(null);
        const result = await pickFolder();
        if (result === null) return;
        if (result.skipped?.length > 0) setDupAlert({ names: result.skipped });
        if (result.added === 0 && !result.skipped?.length) showToast('No new audio files found.', 'info');
        else if (result.added > 0) showToast(`✓ Added ${result.added} song${result.added !== 1 ? 's' : ''} from folder!`);
    };

    const handleFileChange = async (e) => {
        setDupAlert(null);
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const result = await uploadFiles(files);
        e.target.value = '';
        if (!result) return;
        if (result.skipped?.length > 0) setDupAlert({ names: result.skipped });
        if (result.added > 0) showToast(`✓ Uploaded ${result.added} file${result.added !== 1 ? 's' : ''}!`);
        else if (!result.skipped?.length) showToast('No valid audio files selected.', 'info');
    };

    const isBusy = isScanning || isUploading;

    const toastBg = (type) => ({
        success: { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.35)',  color: '#4ade80' },
        info:    { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', color: '#fcd34d' },
        error:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.35)',  color: '#f87171' },
    }[type] || {});

    return (
        <div style={{ position: 'relative', display: 'inline-block', fontFamily: 'var(--font)' }}>

            {/* Duplicate alert */}
            {dupAlert && (
                <div className="animate-fade-up" style={{
                    position: 'fixed', bottom: 96, right: 20, zIndex: 9999,
                    background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.35)',
                    borderRadius: 12, padding: '0.875rem 1rem', maxWidth: 300,
                    boxShadow: 'var(--shadow-lg)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontWeight: 700, fontSize: '0.78rem' }}>
                            <AlertCircle size={14} />
                            {dupAlert.names.length === 1 ? 'Already in library' : `${dupAlert.names.length} already in library`}
                        </div>
                        <button className="btn-icon" onClick={() => setDupAlert(null)}><X size={13} /></button>
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {dupAlert.names.map((name, i) => (
                            <li key={i} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ color: '#f87171', flexShrink: 0 }}>✕</span> {name}
                            </li>
                        ))}
                    </ul>
                    <p style={{ margin: '8px 0 0', fontSize: '0.68rem', color: 'var(--text-subtle)' }}>Skipped — already in your library.</p>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="animate-fade-up" style={{
                    position: 'fixed', bottom: dupAlert ? 252 : 96, right: 20, zIndex: 9999,
                    background: toastBg(toast.type).bg,
                    border: `1px solid ${toastBg(toast.type).border}`,
                    color: toastBg(toast.type).color,
                    padding: '0.6rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 500,
                    boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 7,
                }}>
                    <CheckCircle size={14} /> {toast.msg}
                </div>
            )}

            {/* Folder error */}
            {folderError && !dupAlert && (
                <div className="animate-fade-up" style={{
                    position: 'fixed', bottom: 96, right: 20, zIndex: 9999,
                    background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.35)',
                    borderRadius: 10, padding: '0.65rem 1rem', fontSize: '0.8rem', color: '#f87171',
                    maxWidth: 260, boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 7,
                }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} /> {folderError}
                </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isSupported && (
                    <button
                        className="btn-ghost"
                        onClick={handleSelectFolder}
                        disabled={isBusy}
                        style={{ fontSize: '0.82rem', padding: '0.5rem 0.875rem', opacity: isBusy ? 0.6 : 1 }}
                        title="Scan a folder for music files"
                    >
                        {isScanning ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                                Scanning{progress.count > 0 ? ` (${progress.count})` : '…'}
                            </span>
                        ) : (
                            <><FolderOpen size={15} /> Scan Folder</>
                        )}
                    </button>
                )}

                <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
                <button
                    className="btn-accent"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    style={{ fontSize: '0.82rem', padding: '0.5rem 0.875rem', opacity: isBusy ? 0.6 : 1 }}
                    title={isSupported ? 'Upload individual audio files' : 'Upload audio files'}
                >
                    {isUploading ? `${Math.round(uploadProgress)}%` : <><Plus size={15} /> Upload</>}
                </button>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
