/**
 * Template registry boot module (§9.1 / §9.7). Imported ONCE at app boot; each
 * template module calls register(...) at module scope as a side effect.
 *
 * Adding a template = add a file + one import line here. NO pipeline change.
 *
 * NOTE: this partition (E2) owns ONLY the `arch` slot templates and its
 * fallback chain. The level-0..3 specialized templates (intent / relations /
 * file / symbol / code) are registered by subsystem E1's own boot module; the
 * shell imports both. Import order matters only for fallback uniqueness, which
 * is enforced per slot by register().
 */
import "./arch-static"; // T_ARCH_STATIC      (score 1 when arch.nodes.length > 0)
import "./generic-ba"; // T_GENERIC_BA        (score 0.3)
import "./metric-compare"; // T_METRIC_COMPARE (score 0.2)
import "./relations-fallback"; // isFallback floor for the 'arch' slot
