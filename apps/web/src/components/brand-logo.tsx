'use client'

import Image from 'next/image'
import { useState } from 'react'

export type BrandLogoVariant = 'full' | 'mark' | 'firma'

// TASK-027.61 — intrinsic pixel size of each generated asset (apps/web/public/brand/), used to
// derive a fixed width from the requested `height` so next/image can reserve layout space up
// front and the logo never causes a layout shift while it loads.
const VARIANT_ASSET: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  full: { src: '/brand/metnex-logo.png', width: 417, height: 325 },
  mark: { src: '/brand/metnex-mark.png', width: 285, height: 203 },
  firma: { src: '/brand/metnex-firma.png', width: 1268, height: 730 },
}

interface BrandLogoProps {
  variant?: BrandLogoVariant
  /** Rendered height in px; width is derived from the source asset's own aspect ratio. */
  height?: number
  className?: string
  priority?: boolean
}

/**
 * TASK-027.61 — shared Metnex brand mark. Renders the transparent PNG logo (wordmark or
 * logomark-only, depending on `variant`) and falls back to a plain text "Metnex" label if the
 * image fails to load (offline asset, blocked request, etc.) — required by the login screen's
 * acceptance criteria, applied here for every consumer since the failure mode is identical
 * everywhere the logo appears.
 *
 * `unoptimized` is set deliberately: these are small, fixed-size local assets always rendered at
 * the same handful of sizes (topbar, sidebar, login), so Next's on-demand image optimizer buys
 * nothing here and only adds a moving part (and an extra hop through `/_next/image`) for no
 * benefit — the plain static file is both simpler and marginally faster to serve.
 */
export function BrandLogo({ variant = 'full', height = 32, className = '', priority = false }: BrandLogoProps) {
  const [errored, setErrored] = useState(false)
  const asset = VARIANT_ASSET[variant]
  const width = Math.round((asset.width / asset.height) * height)

  if (errored) {
    return (
      <span className={`font-semibold tracking-wide ${className}`} style={{ lineHeight: `${height}px` }}>
        Metnex
      </span>
    )
  }

  return (
    <Image
      src={asset.src}
      alt="Metnex"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={className}
      onError={() => setErrored(true)}
    />
  )
}
