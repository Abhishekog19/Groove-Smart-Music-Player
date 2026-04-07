import { usePlayerStore } from '../../store/store';
import { Play, Pause, SkipBack, SkipForward, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MiniPlayer() {
    const navigate = useNavigate();
    const { currentSong, isPlaying, togglePlay, nextSong, previousSong } = usePlayerStore();

    if (!currentSong) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-orange-900 border-t-4 border-orange-950 p-4 z-50">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 flex-shrink-0 border-2 border-orange-950 overflow-hidden">
                        {currentSong.cover && currentSong.cover.startsWith('http') ? (
                            <img
                                src={currentSong.cover}
                                alt={currentSong.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-orange-200 to-red-200 flex items-center justify-center text-2xl">
                                {currentSong.cover || '🎵'}
                            </div>
                        )}
                    </div>
                    <div>
                        <h4 className="text-xl text-white font-bold">{currentSong.title}</h4>
                        <p className="text-orange-200">{currentSong.artist}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={previousSong} className="text-white hover:text-orange-200">
                        <SkipBack size={24} />
                    </button>
                    <button
                        onClick={togglePlay}
                        className="bg-orange-600 text-white p-3 hover:bg-orange-700 rounded"
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button onClick={nextSong} className="text-white hover:text-orange-200">
                        <SkipForward size={24} />
                    </button>
                </div>

                <div className="flex items-center gap-4 flex-1 justify-end">
                    <button className="text-white hover:text-orange-200">
                        <Heart size={24} />
                    </button>
                    <button
                        onClick={() => navigate('/player')}
                        className="text-white hover:text-orange-200 text-sm"
                    >
                        Expand
                    </button>
                </div>
            </div>
        </div>
    );
}
