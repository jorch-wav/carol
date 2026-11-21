#!/bin/bash
# Fit every bird preset from its recordings (offline step). Output: fits/<id>.json + fits/<id>.log
cd "$(dirname "$0")/.." || exit 1
B=engine/target/release/carol
BUDGET=${BUDGET:-400}
run() { echo "== $1"; $B fit data/$1 --body $2 --fmin $3 --fmax $4 --budget $BUDGET --items 10 ${INIT:+--init $INIT/$1.json} --out ${OUT:-fits}/$1.json > ${OUT:-fits}/$1.log 2>&1; grep "total match" ${OUT:-fits}/$1.log; }
[ -z "$1" -o "$1" = magpie ] && run magpie 0 300 6000
[ -z "$1" -o "$1" = wattlebird ] && run wattlebird 0 400 9000
[ -z "$1" -o "$1" = kookaburra ] && run kookaburra 1 250 6000
[ -z "$1" -o "$1" = rosella ] && run rosella 2 600 9000
[ -z "$1" -o "$1" = cardinal ] && run cardinal 0 ${FMIN_CARDINAL:-1000} ${FMAX_CARDINAL:-8000}
[ -z "$1" -o "$1" = robin ] && run robin 0 ${FMIN_ROBIN:-1500} ${FMAX_ROBIN:-9000}
[ -z "$1" -o "$1" = pigeon ] && run pigeon 3 150 900
[ -z "$1" -o "$1" = quetzal ] && run quetzal ${QBODY:-1} 500 2500
[ -z "$1" -o "$1" = lyrebird ] && run lyrebird 0 800 6500
[ -z "$1" -o "$1" = butcherbird ] && run butcherbird 0 700 3600
[ -z "$1" -o "$1" = whipbird ] && run whipbird 0 700 8500
[ -z "$1" -o "$1" = bellminer ] && run bellminer 0 2000 8000
[ -z "$1" -o "$1" = cockatoo ] && run cockatoo 2 300 5000
[ -z "$1" -o "$1" = lorikeet ] && run lorikeet 2 700 7000
[ -z "$1" -o "$1" = curlew ] && run curlew 1 800 3500
[ -z "$1" -o "$1" = boobook ] && run boobook ${QBODY:-1} 400 1600
