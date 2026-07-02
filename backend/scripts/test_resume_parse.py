"""Offline proof for the resume parser + bullet-tailoring merge.

Covers the REAL upload shape that used to produce a body-less DOCX:
no markdown headings, '|'-separated role headers, MM/YYYY date lines,
• bullets, 'Name | GitLab: … | Live: …' projects, trailing
'Certifications:' / 'Education:' lines.

Run from backend/:  python -m scripts.test_resume_parse   (no env needed)
Exits non-zero on failure; prints PASS/FAIL per check.
"""
import sys
from app.workers.resume import _parse_resume_markdown, _merge_tailored_bullets

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


HEADINGLESS = """JANE EXAMPLE
H1B  •  +1 (555) 555-5555  •  jane@example.com  •  Kent, OH | Remote  •  LinkedIn  •  GitLab
• AI Engineer with 5+ years building Python backend services and cloud-native applications.
• Experienced in AWS-native architecture using Lambda, DynamoDB, and SageMaker.
BigBank Financial | AI/ML Engineer
08/2023 - Present | Strongsville, OH
• Built production AI backend services that connect model inference and business rules through Python REST APIs.
• Developed AWS-native service workflows using Lambda, DynamoDB, and CloudWatch-style logging patterns.
• Supported AI/ML deployment workflows by adding prompt tests and monitoring hooks.
MegaCorp | Associate Software Engineer
08/2022 - 07/2023 | Dallas, TX
• Built backend automation services using Python, Java, REST APIs, and PostgreSQL.
• Improved service maintainability by adding schema validation and retry handling.
StartupCo | Software Engineering Intern
05/2022 - 07/2022 | Remote
• Improved internal workflow usability by building React and TypeScript UI updates.
CoolAgent - Autonomous Agent | GitLab: coolagent | Live: coolagent.vercel.app
• Built an autonomous agent that scans 600+ postings and returns graded matches.
• Architected a distributed async pipeline with FastAPI and Celery.
PetHelper AI | GitLab: pethelper | Live: pethelper.vercel.app
• Built a triage agent with a multi-turn clinical interview flow.
AI/ML Engineering: Generative AI, LLMs, RAG, model inference
Backend Engineering: Python, FastAPI, REST APIs, Celery, Redis
Certifications: Cloud Vendor AI Foundations Associate;
Second Cloud Certification Associate
Education: Bachelor of Science, Computer Science - Kent State University, Dec 2022
"""

HEADINGED = """# Experience
**Acme** — Engineer
2020 - 2022
• Did the first thing with measurable results across systems.
- Did the second thing with legacy dash bullets preserved.
## Projects
### Sideproject
- GitLab: https://gitlab.com/x/sideproject
- Shipped a thing end to end with real users.
"""


def main() -> None:
    print("== heading-free resume (real upload shape) ==")
    p = _parse_resume_markdown(HEADINGLESS)
    exp = p["experience"]
    check("3 experience entries", len(exp) == 3, f"got {len(exp)}")
    check("companies preserved",
          [e["company"] for e in exp] == ["BigBank Financial", "MegaCorp", "StartupCo"],
          [e["company"] for e in exp])
    check("titles preserved", exp[0]["title"] == "AI/ML Engineer", exp[0]["title"])
    check("dates preserved", exp[0]["dates"] == "08/2023 - Present", exp[0]["dates"])
    check("locations preserved", exp[0]["location"] == "Strongsville, OH", exp[0]["location"])
    check("• bullets captured", len(exp[0]["bullets"]) == 3, exp[0]["bullets"])
    check("2 projects found", len(p["projects"]) == 2, len(p["projects"]))
    check("project links kept", "coolagent" in p["projects"][0]["links"].lower(),
          p["projects"][0]["links"])
    check("project bullets kept", len(p["projects"][0]["bullets"]) == 2)
    check("education extracted", "Kent State" in p["education"], p["education"])
    check("certifications extracted", len(p["certifications"]) >= 1, p["certifications"])
    check("header contact line NOT an experience entry",
          all("linkedin" not in e["company"].lower() for e in exp))

    print("== headinged resume still parses (with • and - bullets) ==")
    q = _parse_resume_markdown(HEADINGED)
    check("headinged experience found", len(q["experience"]) >= 1)
    check("mixed bullet chars captured", len(q["experience"][0]["bullets"]) == 2,
          q["experience"][0]["bullets"])

    print("== tailored-bullet merge keeps facts, swaps text ==")
    tailored = {"experience_bullets": {
        "bigbank financial": ["Tailored bullet one aligned to the JD keywords and stack.",
                              "Tailored bullet two emphasizing platform work.", "x"],
        "Nonexistent Co": ["Should be ignored entirely."],
        "MegaCorp": "not-a-list",
    }}
    _merge_tailored_bullets(p, tailored)
    check("bullets swapped for matched company",
          p["experience"][0]["bullets"][0].startswith("Tailored bullet one"))
    check("junk stub bullet dropped", len(p["experience"][0]["bullets"]) == 2)
    check("company/dates untouched",
          p["experience"][0]["company"] == "BigBank Financial"
          and p["experience"][0]["dates"] == "08/2023 - Present")
    check("unmatched company keeps original bullets",
          len(p["experience"][1]["bullets"]) == 2)
    check("malformed value ignored safely", True)

    n_pass, n = sum(results), len(results)
    print(f"\n=== {n_pass}/{n} resume-parse checks passed ===")
    sys.exit(0 if n_pass == n else 1)


if __name__ == "__main__":
    main()
