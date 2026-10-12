"""Offline subprocess regressions for review.sh; all tools are synthetic stubs."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("review.sh")


class ReviewRunnerTests(unittest.TestCase):
    def run_review(self, packing, reviewing=None, stale=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tools = root / "bin"
            tools.mkdir()
            # Restrict PATH so a missing agy can never run an installed provider.
            for command in ("cat", "rm"):
                (tools / command).symlink_to(Path("/bin") / command)
            for command, body in (("repomix", packing), ("agy", reviewing)):
                if body is not None:
                    stub = tools / command
                    stub.write_text("#!/bin/bash\n" + body + "\n")
                    stub.chmod(0o755)
            (root / "reviewer-prompt.txt").write_text("Synthetic review prompt\n")
            if stale:
                (root / "ai-context.txt").write_text("stale context\n")
            result = subprocess.run(
                ["/bin/bash", str(SCRIPT), "synthetic.ts"], cwd=root,
                env={**os.environ, "PATH": str(tools)}, capture_output=True,
                text=True, timeout=10,
            )
            return result, (root / "ai-context.txt").exists(), (root / "reviewed").exists()

    def test_packing_failure_is_preserved_and_stale_context_not_reviewed(self):
        result, context, reviewed = self.run_review("exit 23", ": > reviewed", stale=True)
        self.assertEqual(result.returncode, 23)
        self.assertFalse(context)
        self.assertFalse(reviewed)

    def test_empty_pack_is_failure(self):
        result, context, _ = self.run_review(": > ai-context.txt", "exit 0")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(context)

    def test_review_failure_is_preserved_and_context_cleaned(self):
        result, context, _ = self.run_review("echo synthetic > ai-context.txt", "exit 31")
        self.assertEqual(result.returncode, 31)
        self.assertFalse(context)

    def test_missing_reviewer_is_failure_and_context_cleaned(self):
        result, context, _ = self.run_review("echo synthetic > ai-context.txt")
        self.assertEqual(result.returncode, 127)
        self.assertFalse(context)

    def test_success_cleans_context(self):
        result, context, _ = self.run_review("echo synthetic > ai-context.txt", "cat > reviewed")
        self.assertEqual(result.returncode, 0)
        self.assertFalse(context)


if __name__ == "__main__":
    unittest.main()
