"""Byte pipe used by the upload state machine.

Bleak and the simulated badge both subclass Link. Notifications arrive
through receive(); the upload code only sees write_data, write_control,
and subscribe().
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from .frames import build_e87_frame, parse_e87_frame


class Link:
    def __init__(self) -> None:
        self.connected = True
        self.authenticated = False
        self.qix_seq = 0
        self.auto_file_complete = False
        self.file_complete_handled = False
        self.path_for_seq: Callable[[int], bytes] | None = None
        self.log: Callable[[str], None] = lambda _msg: None
        self._listeners: list[Callable[[bytes], None]] = []
        self._auto_task: asyncio.Task[None] | None = None

    def subscribe(self, fn: Callable[[bytes], None]) -> Callable[[], None]:
        self._listeners.append(fn)

        def off() -> None:
            try:
                self._listeners.remove(fn)
            except ValueError:
                pass

        return off

    def receive(self, data: bytes) -> None:
        data = bytes(data)
        frame = parse_e87_frame(data)
        if (
            self.auto_file_complete
            and not self.file_complete_handled
            and frame is not None
            and frame.cmd == 0x20
            and frame.flag == 0xC0
            and self.path_for_seq is not None
        ):
            seq = frame.body[0] if frame.body else 0
            self.file_complete_handled = True
            resp = build_e87_frame(0x00, 0x20, self.path_for_seq(seq))
            self.log(f"AUTO-RESPOND cmd 0x20: seq={seq}, sending path response ({len(resp)} bytes)")

            async def send(payload: bytes = resp) -> None:
                try:
                    await self.write_data(payload)
                    self.log("cmd 0x20 auto-response sent.")
                except Exception as exc:
                    self.file_complete_handled = False
                    self.log(f"cmd 0x20 auto-response failed: {exc}")

            self._auto_task = asyncio.create_task(send())
        for fn in list(self._listeners):
            fn(data)

    async def drain_auto(self) -> None:
        task = self._auto_task
        if task is not None:
            await task

    async def write_data(self, data: bytes) -> None:
        raise NotImplementedError

    async def write_control(self, data: bytes) -> None:
        raise NotImplementedError
