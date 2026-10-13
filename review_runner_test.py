"""Offline subprocess regressions for review.sh; all tools are synthetic stubs."""
import os
from pathlib import Path
import subprocess
import signal
import tempfile
import time
import unittest


SCRIPT = Path(os.environ.get("REVIEW_RUNNER_SCRIPT", Path(__file__).with_name("review.sh")))

PACK_ARGS = '''output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --include) target="$2"; shift 2 ;;
    *) shift ;;
  esac
done
test -n "$output" || exit 90
'''


class ReviewRunnerTests(unittest.TestCase):
    def run_review(self, packing, reviewing=None, stale=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tools = root / "bin"
            tools.mkdir()
            # Restrict PATH so a missing agy can never run an installed provider.
            for command in ("cat", "rm", "mktemp"):
                (tools / command).symlink_to(Path("/usr/bin" if command == "mktemp" else "/bin") / command)
            for command, body in (("repomix", packing), ("agy", reviewing)):
                if body is not None:
                    stub = tools / command
                    stub.write_text("#!/bin/bash\n" + (PACK_ARGS if command == "repomix" else "") + body + "\n")
                    stub.chmod(0o755)
            (root / "reviewer-prompt.txt").write_text("Synthetic review prompt\n")
            if stale:
                (root / "ai-context.txt").write_text("stale context\n")
            result = subprocess.run(
                ["/bin/bash", str(SCRIPT), "synthetic.ts"], cwd=root,
                env={**os.environ, "PATH": str(tools), "TMPDIR": str(root), "AGY_BIN": "agy"}, capture_output=True,
                text=True, timeout=10,
            )
            if stale:
                self.assertEqual((root / "ai-context.txt").read_text(), "stale context\n")
            owned_contexts = [path for path in root.glob("ai-context.*") if path.name != "ai-context.txt"]
            return result, bool(owned_contexts), (root / "reviewed").exists()

    def test_packing_failure_is_preserved_and_stale_context_not_reviewed(self):
        result, context, reviewed = self.run_review("exit 23", ": > reviewed", stale=True)
        self.assertEqual(result.returncode, 23)
        self.assertFalse(context)
        self.assertFalse(reviewed)

    def test_empty_pack_is_failure(self):
        result, context, _ = self.run_review(': > "$output"', "exit 0")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(context)

    def test_review_failure_is_preserved_and_context_cleaned(self):
        result, context, _ = self.run_review('echo synthetic > "$output"', "exit 31")
        self.assertEqual(result.returncode, 31)
        self.assertFalse(context)

    def test_missing_reviewer_is_failure_and_context_cleaned(self):
        result, context, _ = self.run_review('echo synthetic > "$output"')
        self.assertEqual(result.returncode, 127)
        self.assertFalse(context)

    def test_success_cleans_context(self):
        result, context, _ = self.run_review('echo synthetic > "$output"', "cat > reviewed")
        self.assertEqual(result.returncode, 0)
        self.assertFalse(context)

    def test_overlapping_reviews_read_and_cleanup_only_their_own_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tools = root / "bin"
            tools.mkdir()
            for command in ("cat", "rm", "mktemp", "sleep"):
                (tools / command).symlink_to(Path("/usr/bin" if command == "mktemp" else "/bin") / command)
            pack = tools / "repomix"
            pack.write_text('#!/bin/bash\n' + PACK_ARGS + '''
echo "bundle:$target" > "$output"
echo "$output" > "$target.path"
while [ ! -f "$target.release" ]; do sleep 0.01; done
''')
            pack.chmod(0o755)
            reviewer = tools / "agy"
            reviewer.write_text("#!/bin/bash\ncat\n")
            reviewer.chmod(0o755)
            (root / "reviewer-prompt.txt").write_text("Synthetic prompt\n")
            env = {**os.environ, "PATH": str(tools), "TMPDIR": str(root), "AGY_BIN": "agy"}
            processes = []
            try:
                for target in ("first", "second"):
                    processes.append(subprocess.Popen(
                        ["/bin/bash", str(SCRIPT), target], cwd=root, env=env,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                        start_new_session=True,
                    ))
                deadline = time.monotonic() + 5
                while not all((root / f"{target}.path").exists() for target in ("first", "second")):
                    if time.monotonic() >= deadline:
                        self.fail("Both stub packers did not reach the overlap barrier")
                    time.sleep(0.01)
                first_path = Path((root / "first.path").read_text().strip())
                second_path = Path((root / "second.path").read_text().strip())
                self.assertNotEqual(first_path, second_path)
                (root / "first.release").touch()
                first_out, first_err = processes[0].communicate(timeout=5)
                self.assertEqual(processes[0].returncode, 0, first_err)
                self.assertIn("bundle:first", first_out)
                self.assertNotIn("bundle:second", first_out)
                self.assertFalse(first_path.exists())
                self.assertTrue(second_path.exists(), "First exit deleted the second run's bundle")
                self.assertEqual(second_path.read_text(), "bundle:second\n")
                (root / "second.release").touch()
                second_out, second_err = processes[1].communicate(timeout=5)
                self.assertEqual(processes[1].returncode, 0, second_err)
                self.assertIn("bundle:second", second_out)
                self.assertNotIn("bundle:first", second_out)
                self.assertFalse(second_path.exists())
            finally:
                for process in processes:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGKILL)
                    process.communicate(timeout=5)


if __name__ == "__main__":
    unittest.main()
