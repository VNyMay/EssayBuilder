r"""Chart axis labels are plain text, but AIs (and students) write maths in them: $\Omega/\omega_0$.
This turns such maths into plain Unicode (Ω/ω₀) so it prints correctly."""
import re

GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ", "eta": "η",
    "theta": "θ", "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ",
    "sigma": "σ", "tau": "τ", "phi": "φ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π", "Sigma": "Σ", "Phi": "Φ",
    "Psi": "Ψ", "Omega": "Ω", "cdot": "·", "times": "×", "pm": "±", "approx": "≈", "leq": "≤", "geq": "≥",
    "neq": "≠", "infty": "∞", "to": "→", "rightarrow": "→", "degree": "°",
}
SUBSCRIPT = str.maketrans("0123456789+-=()aeoxhklmnpst", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ")
SUPERSCRIPT = str.maketrans("0123456789+-=()in", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ")


def latex_to_text(text):
    if not text or "$" not in text:
        return text

    def convert(match):
        body = match.group(1)
        body = re.sub(r"\\(?:text|mathrm|mathbf|mathit)\{([^{}]*)\}", r"\1", body)
        body = re.sub(r"\\([A-Za-z]+)", lambda m: GREEK.get(m.group(1), m.group(1)), body)
        body = re.sub(r"_\{([^{}]*)\}|_(\w)", lambda m: (m.group(1) or m.group(2)).translate(SUBSCRIPT), body)
        body = re.sub(r"\^\{([^{}]*)\}|\^(\w)", lambda m: (m.group(1) or m.group(2)).translate(SUPERSCRIPT), body)
        return body.replace("{", "").replace("}", "").replace("\\ ", " ").replace("\\,", " ")

    return re.sub(r"\$([^$]+)\$", convert, text)
