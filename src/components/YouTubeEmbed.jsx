import { useState } from 'react'
import { FaYoutube } from 'react-icons/fa'
import { youtubeId } from '../lib/format'

// Shows the video thumbnail first; the player loads (and starts) on click.
export default function YouTubeEmbed({ url, title, channel }) {
  const [play, setPlay] = useState(false)
  const id = youtubeId(url)

  if (!id) {
    return (
      <div className="grid aspect-video place-items-center rounded-2xl bg-gradient-to-br from-navy-900 to-brand-800 p-6 text-center text-white">
        <div>
          <FaYoutube className="mx-auto mb-3 text-5xl text-white/80" />
          <p className="font-semibold">Tutorial video coming soon</p>
          {channel && (
            <a href={channel} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
              Browse our YouTube channel
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-card">
      {play ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title || 'Product tutorial'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button onClick={() => setPlay(true)} className="group absolute inset-0" aria-label={`Play video: ${title}`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:scale-105 group-hover:opacity-100" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute left-1/2 top-1/2 grid h-16 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[#ff0000] text-white shadow-xl transition group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="absolute bottom-3 left-4 right-4 truncate text-left text-sm font-semibold text-white">{title}</span>
        </button>
      )}
    </div>
  )
}
