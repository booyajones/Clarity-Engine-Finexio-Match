.PHONY: fast full unit integration e2e perf lint type sec qa all clean

# Fast QA set for every change
fast: lint type unit smoke
	@echo "✅ FAST QA PASSED"

# Full QA set after fast passes
full: integration e2e sec perf
	@echo "✅ FULL QA PASSED"

# Individual test targets
lint:
	@./scripts/run_lint.sh

type:
	@./scripts/run_typecheck.sh

unit:
	@./scripts/run_unit.sh

smoke:
	@./scripts/run_smoke.sh

integration:
	@./scripts/run_integration.sh

e2e:
	@./scripts/run_e2e.sh

sec:
	@./scripts/run_security.sh

perf:
	@./scripts/run_perf.sh

# Coverage report
coverage:
	@./scripts/run_coverage.sh

# Complete QA suite
qa: fast full coverage
	@echo "✅ ALL QA GATES PASSED"
	@./scripts/update_qa_reports.sh

# Clean artifacts
clean:
	@rm -rf qa_reports coverage .nyc_output
	@echo "🧹 Cleaned QA artifacts"

# Watch mode for development
watch:
	@npm run dev:watch

# All targets
all: clean qa
	@echo "✅ COMPLETE QA CYCLE FINISHED"