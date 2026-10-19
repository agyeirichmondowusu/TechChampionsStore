import { FaInstagram, FaLinkedinIn, FaTiktok, FaYoutube } from 'react-icons/fa'

export const SOCIALS = [
  { key: 'tiktok', label: 'TikTok', Icon: FaTiktok, color: 'hover:bg-black' },
  { key: 'youtube', label: 'YouTube', Icon: FaYoutube, color: 'hover:bg-[#ff0000]' },
  { key: 'instagram', label: 'Instagram', Icon: FaInstagram, color: 'hover:bg-[#d62976]' },
  { key: 'linkedin', label: 'LinkedIn', Icon: FaLinkedinIn, color: 'hover:bg-[#0a66c2]' },
]

export default function SocialLinks({ socials, size = 'md' }) {
  const dim = size === 'sm' ? 'h-9 w-9 text-base' : 'h-11 w-11 text-lg'
  return (
    <div className="flex gap-3">
      {SOCIALS.filter((s) => socials?.[s.key]).map(({ key, label, Icon, color }) => (
        <a
          key={key}
          href={socials[key]}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          title={label}
          className={`grid ${dim} place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:-translate-y-0.5 ${color}`}
        >
          <Icon />
        </a>
      ))}
    </div>
  )
}
