"""Build the original display glyphs used by the institutional cover line."""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path


# Outlines are drawn on a 1000-unit em, on a top-left-origin design grid.
GLYPHS = {
    "A": (712, "M8 704 289 10H425L708 704H630L543 483H171L84 704Z M197 418H517L379 75H340Z"),
    "D": (764, "M31 10H336C599 10 732 134 732 357S599 704 336 704H31Z M100 76V638H334C552 638 662 543 662 357S552 76 334 76Z"),
    "E": (620, "M32 10H598V76H102V319H556V384H102V638H598V704H32Z"),
    "F": (598, "M32 10H584V76H102V328H542V393H102V704H32Z"),
    "G": (787, "M740 215H668C645 119 554 64 406 64C194 64 102 179 102 357S203 650 406 650C553 650 677 572 679 419H441V354H747V704H685V586C633 669 536 718 406 718C156 718 31 575 31 357S156 -3 406 -3C592 -3 711 82 740 215Z"),
    "I": (399, "M20 10H379V75H233V639H379V704H20V639H164V75H20Z"),
    "J": (560, "M466 10H536V470C536 637 453 718 281 718C108 718 24 630 24 480V435H94V478C94 594 150 652 281 652C410 652 466 596 466 469Z"),
    "L": (593, "M32 10H102V638H577V704H32Z"),
    "M": (883, "M32 10H154L441 607L727 10H851V704H782V94L486 704H396L101 94V704H32Z"),
    "N": (761, "M32 10H155L660 627V10H730V704H607L102 87V704H32Z"),
    "O": (789, "M394 -3C639 -3 759 142 759 357S639 718 394 718C149 718 30 572 30 357S149 -3 394 -3Z M394 64C195 64 100 177 100 357S195 651 394 651 689 537 689 357 593 64 394 64Z"),
    "P": (673, "M32 10H397C574 10 653 92 653 225S574 444 397 444H102V704H32Z M102 76V378H392C531 378 583 324 583 225S531 76 392 76Z"),
    "R": (713, "M32 10H415C602 10 686 81 686 220C686 329 624 399 517 422C625 446 662 515 662 622V704H592V625C592 507 538 448 409 448H102V704H32Z M102 76V382H414C554 382 616 321 616 220S554 76 414 76Z"),
    "S": (690, "M651 210H579C565 114 485 64 346 64C218 64 126 111 126 195C126 270 184 302 333 329L420 345C588 375 665 427 665 531C665 653 540 718 352 718C153 718 40 645 22 503H94C111 600 205 652 352 652C494 652 594 613 594 534C594 459 534 433 388 405L295 388C135 358 55 306 55 198C55 72 181 -3 346 -3C527 -3 635 71 651 210Z"),
    "U": (752, "M31 10H101V425C101 570 185 652 376 652C566 652 652 570 652 425V10H722V426C722 616 607 718 376 718C145 718 31 616 31 426Z"),
    "V": (704, "M9 10H87L351 630L616 10H694L398 704H304Z"),
    ",": (164, "M45 627H120V704L74 803H19L55 704H45Z"),
    ".": (164, "M45 628H120V704H45Z"),
    " ": (192, ""),
}
GLYPHS["Í"] = (GLYPHS["I"][0], GLYPHS["I"][1] + " M156 -58 251 -164H337L221 -58Z")


def build():
    font = FontBuilder(1000, isTTF=False)
    cmap = {ord(char): f"uni{ord(char):04X}" for char in GLYPHS}
    font.setupGlyphOrder([".notdef", *cmap.values()])
    font.setupCharacterMap(cmap)
    outlines = {".notdef": T2CharStringPen(600, None).getCharString()}
    widths = {".notdef": 600}

    for char, (width, path) in GLYPHS.items():
        name = cmap[ord(char)]
        pen = T2CharStringPen(width, None)
        parse_path(path, TransformPen(pen, (1, 0, 0, -1, 0, 704)))
        outlines[name] = pen.getCharString()
        widths[name] = width

    font.setupCFF("RiachoCapa-Regular", {"FullName": "Riacho Capa Regular"}, outlines, {})
    # The CFF bounding boxes supply the true bearings after the outlines exist.
    metrics = {}
    for name, width in widths.items():
        bounds = outlines[name].calcBounds(None)
        metrics[name] = (width, round(bounds[0]) if bounds else 0)
    font.setupHorizontalMetrics(metrics)
    font.setupHorizontalHeader(ascent=895, descent=-145)
    font.setupNameTable({
        "familyName": "Riacho Capa",
        "styleName": "Regular",
        "uniqueFontIdentifier": "RiachoCapa-Regular-1",
        "fullName": "Riacho Capa Regular",
        "psName": "RiachoCapa-Regular",
        "version": "Version 1.000",
    })
    font.setupOS2(
        version=4, sTypoAscender=895, sTypoDescender=-145, sTypoLineGap=0,
        usWinAscent=895, usWinDescent=145, sCapHeight=704, fsSelection=128,
    )
    font.setupPost()
    # Keep the generated WOFF identical across runs.
    font.font["head"].created = font.font["head"].modified = 3878064000
    font.font.recalcTimestamp = False
    font.font.flavor = "woff"
    target = Path(__file__).resolve().parents[1] / "public" / "fonts" / "riacho-capa.woff"
    target.parent.mkdir(parents=True, exist_ok=True)
    font.save(target)


if __name__ == "__main__":
    build()
