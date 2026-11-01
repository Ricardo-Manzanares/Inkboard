#!/bin/sh
# Repinta tras un gesto. gesture.lua ya ha guardado la pantalla nueva en $PAGE al deslizar en horizontal.
#   page.sh          la pantalla actual
#   page.sh tap X Y  un toque: el servidor abre el detalle de la tarjeta o lo cierra con la X
#   page.sh home     vuelve del detalle a las tarjetas
. /mnt/us/extensions/kindle-dash/bin/lib.sh
case "$1" in
  tap) TAP="$2,$3" ;;
  home) rm -f "$VIEW" ;;
esac
draw 1
