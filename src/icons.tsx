// Мои иконки: тонкие линии, рисую сам, чтобы не тянуть целую библиотеку
// My icons: thin strokes, hand-drawn so the app doesn't pull in an icon library

type P = { size?: number };
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconBack = ({ size = 24 }: P) => svg(size, <path d="M15 5l-7 7 7 7" />);
export const IconPlus = ({ size = 22 }: P) => svg(size, <path d="M12 5v14M5 12h14" />);
export const IconMore = ({ size = 22 }: P) => svg(size, <>
  <circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" />
  <circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></>);
export const IconClose = ({ size = 22 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);
export const IconTrash = ({ size = 20 }: P) => svg(size, <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />);
export const IconBookmark = ({ size = 22, filled = false }: P & { filled?: boolean }) =>
  svg(size, <path d="M7 4h10v16l-5-4-5 4z" fill={filled ? 'currentColor' : 'none'} />);
export const IconList = ({ size = 22 }: P) => svg(size, <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />);
export const IconType = ({ size = 22 }: P) => svg(size, <><path d="M3 18l4.5-12L12 18M4.6 14h5.8" /><path d="M14 18l3-8 3 8M15 15.5h4" /></>);
export const IconSearch = ({ size = 20 }: P) => svg(size, <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>);
export const IconFile = ({ size = 22 }: P) => svg(size, <><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5v4h4" /></>);
export const IconBook = ({ size = 22 }: P) => svg(size, <path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5" />);
