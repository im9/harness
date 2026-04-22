.PHONY: dev-up dev-down dev-status dev-logs help

DEV_DIR        := .dev
BACKEND_PID    := $(DEV_DIR)/backend.pid
FRONTEND_PID   := $(DEV_DIR)/frontend.pid
BACKEND_LOG    := $(DEV_DIR)/backend.log
FRONTEND_LOG   := $(DEV_DIR)/frontend.log
BACKEND_PORT   := 8787
FRONTEND_PORT  := 5787

help:
	@echo "Dev server targets:"
	@echo "  make dev-up      Launch backend (:$(BACKEND_PORT)) + frontend (:$(FRONTEND_PORT)) in the background"
	@echo "  make dev-down    Stop both"
	@echo "  make dev-status  Report which ports are listening"
	@echo "  make dev-logs    Tail both logs (Ctrl-C to exit)"

dev-up:
	@mkdir -p $(DEV_DIR)
	@if lsof -ti :$(BACKEND_PORT) >/dev/null 2>&1; then \
		echo "backend: port $(BACKEND_PORT) already in use, skipping"; \
	else \
		nohup uv run harness dev > $(BACKEND_LOG) 2>&1 < /dev/null & \
		echo $$! > $(BACKEND_PID); \
		echo "backend:  started (PID $$(cat $(BACKEND_PID))) -> $(BACKEND_LOG)"; \
	fi
	@if lsof -ti :$(FRONTEND_PORT) >/dev/null 2>&1; then \
		echo "frontend: port $(FRONTEND_PORT) already in use, skipping"; \
	else \
		nohup pnpm -C frontend dev > $(FRONTEND_LOG) 2>&1 < /dev/null & \
		echo $$! > $(FRONTEND_PID); \
		echo "frontend: started (PID $$(cat $(FRONTEND_PID))) -> $(FRONTEND_LOG)"; \
	fi

dev-down:
	@for f in $(BACKEND_PID) $(FRONTEND_PID); do \
		if [ -f $$f ]; then \
			pid=$$(cat $$f); \
			if kill $$pid 2>/dev/null; then \
				echo "stopped PID $$pid ($$f)"; \
			else \
				echo "PID $$pid not running ($$f)"; \
			fi; \
			rm -f $$f; \
		fi; \
	done
	@# uvicorn --reload and pnpm spawn children; sweep anything still holding the ports.
	@sleep 1
	@for port in $(BACKEND_PORT) $(FRONTEND_PORT); do \
		pids="$$(lsof -ti :$$port 2>/dev/null)"; \
		if [ -n "$$pids" ]; then \
			echo "$$pids" | xargs kill 2>/dev/null && echo "swept port $$port (PIDs: $$pids)"; \
		fi; \
	done

dev-status:
	@for port in $(BACKEND_PORT) $(FRONTEND_PORT); do \
		pids="$$(lsof -ti :$$port 2>/dev/null)"; \
		if [ -n "$$pids" ]; then \
			echo "port $$port: UP   (PIDs: $$pids)"; \
		else \
			echo "port $$port: down"; \
		fi; \
	done

dev-logs:
	@tail -F $(BACKEND_LOG) $(FRONTEND_LOG)
