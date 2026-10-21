.PHONY: check sdk-probe

check:
	npm run check
	npm run smoke
	npm run smoke:sse-ui
	npm run e2e

sdk-probe:
	npm run probe:sdk
