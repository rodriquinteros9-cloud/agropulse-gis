import React from 'react';

export default function BrandLogo({ className = "h-9", iconOnly = false }: { className?: string, iconOnly?: boolean }) {
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 100 100" 
                className="h-full aspect-square" 
                fill="none"
            >
                {/* ── Pulse Wave ── */}
                <path 
                    d="M 5 60 L 25 60 L 37 30 L 52 85 L 63 60 L 72 60" 
                    stroke="var(--color-accent-light)" 
                    strokeWidth="8" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                />
                
                {/* ── Leaf / Grow ── */}
                <path
                    d="M 70 60 C 70 40, 85 30, 95 30 C 92 48, 80 60, 70 60 Z"
                    fill="var(--color-accent)"
                />
                
                {/* ── Inner Leaf Vein ── */}
                <path
                    d="M 70 60 C 76 52, 85 41, 95 30"
                    stroke="var(--color-background)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    style={{ stroke: 'var(--color-primary-dark)' }}
                />
            </svg>

            {!iconOnly && (
                <span className="text-[1.35em] tracking-tight flex items-baseline">
                    <span className="font-light" style={{ color: 'var(--color-primary)' }}>Agro</span>
                    <span className="font-extrabold" style={{ color: 'var(--color-primary)' }}>Pulse</span>
                </span>
            )}
        </div>
    );
}
