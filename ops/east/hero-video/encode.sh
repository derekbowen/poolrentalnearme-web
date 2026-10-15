#!/usr/bin/env bash
# Encode the hero deliverables from the masters in $1 (default out3).
# 2-pass VBR, one GOP per file (no mid-loop keyframe "snaps"), BT.709 tags,
# H.264 High@4.0 + faststart, VP9 2-pass constrained quality. No audio.
set -euo pipefail
D=${1:-out3}; cd "$D"
TAG=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -map_metadata -1 -an)
XS=(-vf "scale=360:640:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709")

ffmpeg -y -loglevel error -i master-desktop.mp4 -vf gblur=sigma=0.4 -c:v libx264 -preset veryfast -crf 6 "${TAG[@]}" ref-desktop.mp4
ffmpeg -y -loglevel error -i master-mobile.mp4 -vf gblur=sigma=0.3 -c:v libx264 -preset veryfast -crf 6 "${TAG[@]}" ref-mobile.mp4

h264() { # in out bitrate maxrate bufsize [filter...]
  local in=$1 out=$2 b=$3 mr=$4 bs=$5; shift 5
  local X=(-c:v libx264 -preset slow -b:v "$b" -maxrate "$mr" -bufsize "$bs" -profile:v high -level:v 4.0
           -pix_fmt yuv420p -x264-params keyint=600:min-keyint=600:scenecut=0:qcomp=0.7:ipratio=1.2:zones=535,554,b=2.5)
  ffmpeg -y -loglevel error -i "$in" "$@" "${X[@]}" -pass 1 -passlogfile p264 -an -f null /dev/null
  ffmpeg -y -loglevel error -i "$in" "$@" "${X[@]}" -pass 2 -passlogfile p264 -movflags +faststart "${TAG[@]}" "$out"
}
vp9() { # in out crf bitrate [filter...]
  local in=$1 out=$2 crf=$3 b=$4; shift 4
  local X=(-c:v libvpx-vp9 -crf "$crf" -b:v "$b" -g 600 -keyint_min 600 -row-mt 1 -deadline good -cpu-used 1)
  ffmpeg -y -loglevel error -i "$in" "$@" "${X[@]}" -pass 1 -passlogfile pvp9 -f null /dev/null
  ffmpeg -y -loglevel error -i "$in" "$@" "${X[@]}" -auto-alt-ref 1 -lag-in-frames 25 -pass 2 -passlogfile pvp9 "${TAG[@]}" "$out"
}

h264 ref-desktop.mp4 hero-desktop.mp4 1650k 2600k 7000k
vp9  ref-desktop.mp4 hero-desktop.webm 34 1350k
h264 ref-mobile.mp4  hero-mobile.mp4   1100k 1800k 4500k
vp9  ref-mobile.mp4  hero-mobile.webm  33 1000k
h264 ref-mobile.mp4  hero-mobile-xs.mp4 210k 340k 900k "${XS[@]}"
vp9  ref-mobile.mp4  hero-mobile-xs.webm 37 190k "${XS[@]}"
rm -f p264* pvp9*

# Posters: frame 0 of the encode input (ref, same light blur as the video) so the
# poster-to-video hand-off does not visibly soften. Untagged sRGB.
for v in desktop mobile xs; do
  src=ref-$v.mp4; vf=null
  [ $v = xs ] && src=ref-mobile.mp4 && vf=scale=360:640:flags=lanczos
  ffmpeg -y -loglevel error -i $src -frames:v 1 -vf $vf -c:v png poster-$v.png
  python3 - "$v" <<'EOF2'
import sys
from PIL import Image
v = sys.argv[1]
im = Image.open(f'poster-{v}.png').convert('RGB')
name = 'hero-mobile-xs' if v == 'xs' else f'hero-{v}'
im.save(f'{name}-poster.jpg', quality=72, progressive=True, optimize=True)
im.save(f'{name}-poster.webp', quality=66, method=6)
EOF2
  rm -f poster-$v.png
done
