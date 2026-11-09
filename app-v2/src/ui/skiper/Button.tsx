import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Przycisk w konwencji Skiper UI: krok w górę na hover, wciśnięcie na klik,
 * jeden przebieg światła po powierzchni przy najechaniu. Jeden kształt w całej aplikacji.
 */
type Variant = 'primary' | 'ghost' | 'quiet';
type Props = HTMLMotionProps<'button'> & { variant?: Variant; size?: 'lg' | 'md' | 'sm' };

const base = 'group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full font-semibold select-none transition-colors duration-200 disabled:pointer-events-none';
const variants: Record<Variant, string> = {
  primary: 'bg-milk text-ink-0 shadow-[0_10px_30px_-10px_rgba(143,192,255,0.55)] aria-disabled:bg-milk/70',
  ghost: 'border border-line bg-white/[0.03] text-milk hover:bg-white/[0.07]',
  quiet: 'text-muted hover:text-milk',
};
const sizes = { lg: 'h-14 px-7 text-[16.5px]', md: 'h-12 px-5 text-[15px]', sm: 'h-10 px-4 text-[14px]' };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = 'primary', size = 'lg', className, children, ...rest }, ref) {
  return (
    <motion.button
      ref={ref}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {variant === 'primary' && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover:left-[120%] group-hover:opacity-100" />
      )}
      <span className="relative inline-flex items-center gap-2.5">{children as React.ReactNode}</span>
    </motion.button>
  );
});

export function IconButton({ label, className, children, ...rest }: HTMLMotionProps<'button'> & { label: string }) {
  return (
    <motion.button
      aria-label={label}
      title={label}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.92 }}
      className={cn('grid h-11 w-11 place-items-center rounded-full border border-line bg-ink-0/60 text-milk backdrop-blur-md', className)}
      {...rest}
    >
      {children as React.ReactNode}
    </motion.button>
  );
}
