import json
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from config import settings
from models import EventType, OTDREvent, OTDRTrace, TraceStatus


@dataclass
class RouteReferenceBundle:
    event_file: Path
    measurement_file: Path
    events: List[OTDREvent]
    trace_points: List[Tuple[float, float]]
    baseline_avg_power_db: float


class OTDRSimulator:
    """Simulates OTDR measurements for fiber optic cables."""

    # Route configurations (in real system, this would be in database)
    ROUTE_CONFIG = {
        "OR_1": {"region": "Tunis", "length_km": 25.0, "splice_count": 5},
        "OR_2": {"region": "Sfax", "length_km": 35.0, "splice_count": 7},
        "OR_3": {"region": "Sousse", "length_km": 18.0, "splice_count": 4},
        "OR_4": {"region": "Tunis", "length_km": 42.0, "splice_count": 8},
        "OR_5": {"region": "Sfax", "length_km": 30.0, "splice_count": 6},
    }

    def __init__(self, rtu_id: str):
        self.rtu_id = rtu_id
        self.attenuation = settings.fiber_attenuation

        self.reference_root = self._resolve_reference_root()
        self.reference_index = self._discover_reference_files()
        self.reference_cache: Dict[str, RouteReferenceBundle] = {}
        self.route_power_offsets_db: Dict[str, float] = {}

    def generate_trace(
        self,
        route_id: str,
        inject_fault: bool = False,
        fault_type: str = "normal",
        distance_km: float = None,
    ) -> OTDRTrace:
        """
        Generate an OTDR trace from route reference files when available.
        Falls back to synthetic generation if no reference files are found.
        """
        reference = self._get_route_reference(route_id)

        if reference:
            effective_distance = distance_km or self._infer_distance_from_reference(reference)
            events = [
                OTDREvent(
                    type=event.type,
                    distance_km=event.distance_km,
                    loss_db=event.loss_db,
                    reflection_db=event.reflection_db,
                )
                for event in reference.events
            ]

            if inject_fault:
                self._inject_fault_event(events, effective_distance, fault_type)

            total_loss = self._calculate_total_loss(effective_distance, events)
            average_power_db, variation_db = self._next_average_power(route_id, reference.baseline_avg_power_db)

            if inject_fault:
                average_power_db -= self._fault_power_penalty(fault_type)
                status = self._determine_status(total_loss, events)
            else:
                status = TraceStatus.NORMAL

            return OTDRTrace(
                route_id=route_id,
                rtu_id=self.rtu_id,
                timestamp=datetime.now(),
                fiber_length_km=round(effective_distance, 3),
                total_loss_db=round(total_loss, 3),
                events=events,
                status=status,
                measurement_duration_ms=random.randint(800, 1200),
                event_reference_file=reference.event_file.name,
                measurement_reference_file=reference.measurement_file.name,
                average_power_db=round(average_power_db, 3),
                power_variation_db=round(variation_db, 3),
            )

        # Fallback: synthetic trace generation
        if distance_km is None:
            if route_id in self.ROUTE_CONFIG:
                distance_km = self.ROUTE_CONFIG[route_id]["length_km"]
            else:
                distance_km = random.uniform(10.0, 100.0)

        splice_count = max(3, int(distance_km / 6))
        events = self._generate_events(distance_km, splice_count, inject_fault, fault_type)
        total_loss = self._calculate_total_loss(distance_km, events)
        baseline_power = max(20.0, 42.0 - (distance_km * 0.08))
        average_power_db, variation_db = self._next_average_power(route_id, baseline_power)

        if inject_fault:
            average_power_db -= self._fault_power_penalty(fault_type)
            status = self._determine_status(total_loss, events)
        else:
            status = TraceStatus.NORMAL

        return OTDRTrace(
            route_id=route_id,
            rtu_id=self.rtu_id,
            timestamp=datetime.now(),
            fiber_length_km=distance_km,
            total_loss_db=round(total_loss, 3),
            events=events,
            status=status,
            measurement_duration_ms=random.randint(800, 1200),
            average_power_db=round(average_power_db, 3),
            power_variation_db=round(variation_db, 3),
        )

    def _resolve_reference_root(self) -> Optional[Path]:
        raw_dir = (settings.routes_reference_dir or "Routes").strip()
        if not raw_dir:
            raw_dir = "Routes"

        candidates = [
            Path(raw_dir),
            Path.cwd() / raw_dir,
            Path.cwd().parent / raw_dir,
            Path(__file__).resolve().parent / raw_dir,
            Path(__file__).resolve().parent.parent / raw_dir,
        ]

        visited = set()
        for candidate in candidates:
            resolved = candidate.resolve()
            key = str(resolved).lower()
            if key in visited:
                continue
            visited.add(key)
            if resolved.exists() and resolved.is_dir():
                return resolved

        return None

    def _discover_reference_files(self) -> Dict[str, Dict[str, Path]]:
        index: Dict[str, Dict[str, Path]] = {}
        if self.reference_root is None:
            return index

        for json_path in self.reference_root.rglob("*-dump.json"):
            route_id = self._extract_route_id_from_filename(json_path.name)
            if not route_id:
                continue
            entry = index.setdefault(route_id, {})
            entry["event"] = json_path

        for dat_path in self.reference_root.rglob("*-trace.dat"):
            route_id = self._extract_route_id_from_filename(dat_path.name)
            if not route_id:
                continue
            entry = index.setdefault(route_id, {})
            entry["trace"] = dat_path

        return index

    def _get_route_reference(self, route_id: str) -> Optional[RouteReferenceBundle]:
        normalized_route_id = self._normalize_route_id(route_id)
        if normalized_route_id in self.reference_cache:
            return self.reference_cache[normalized_route_id]

        file_entry = self.reference_index.get(normalized_route_id)
        if not file_entry:
            return None

        event_file = file_entry.get("event")
        measurement_file = file_entry.get("trace")
        if not event_file or not measurement_file:
            return None

        try:
            event_json = json.loads(event_file.read_text(encoding="utf-8"))
            events = self._parse_events(event_json)
            trace_points = self._parse_trace_points(measurement_file)

            if trace_points:
                baseline_avg_power_db = sum(point[1] for point in trace_points) / len(trace_points)
            else:
                baseline_avg_power_db = 35.0

            bundle = RouteReferenceBundle(
                event_file=event_file,
                measurement_file=measurement_file,
                events=events,
                trace_points=trace_points,
                baseline_avg_power_db=baseline_avg_power_db,
            )
            self.reference_cache[normalized_route_id] = bundle
            return bundle
        except Exception:
            return None

    def _parse_trace_points(self, trace_file: Path) -> List[Tuple[float, float]]:
        points: List[Tuple[float, float]] = []
        with trace_file.open("r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue

                parts = stripped.split()
                if len(parts) < 2:
                    continue

                x_value = self._safe_float(parts[0])
                y_value = self._safe_float(parts[1])
                if x_value is None or y_value is None:
                    continue

                points.append((x_value, y_value))

        return points

    def _parse_events(self, event_json: dict) -> List[OTDREvent]:
        key_events = event_json.get("KeyEvents") or {}
        sorted_events: List[Tuple[int, dict]] = []

        for key, value in key_events.items():
            if not isinstance(value, dict) or not key.lower().startswith("event "):
                continue

            try:
                order = int(key.split(" ", 1)[1])
            except (ValueError, IndexError):
                order = 9999

            sorted_events.append((order, value))

        sorted_events.sort(key=lambda item: item[0])

        events: List[OTDREvent] = []
        for _, event_data in sorted_events:
            distance_km = self._safe_float(event_data.get("distance"))
            if distance_km is None:
                continue

            event_type = self._map_event_type(str(event_data.get("type", "")))
            splice_loss = self._safe_float(event_data.get("splice loss"))
            reflection_loss = self._safe_float(event_data.get("refl loss"))

            loss_db = abs(splice_loss) if splice_loss is not None else 0.0
            if loss_db < 0.01 and reflection_loss is not None:
                # Reflection values can be very large negative numbers; keep contribution realistic.
                loss_db = abs(reflection_loss) / 100.0

            loss_db = max(0.01, round(loss_db, 3))

            events.append(
                OTDREvent(
                    type=event_type,
                    distance_km=round(distance_km, 3),
                    loss_db=loss_db,
                )
            )

        return events

    def _infer_distance_from_reference(self, reference: RouteReferenceBundle) -> float:
        if reference.trace_points:
            return max(point[0] for point in reference.trace_points)

        if reference.events:
            return max(event.distance_km for event in reference.events)

        return random.uniform(float(settings.min_fiber_length), float(settings.max_fiber_length))

    def _next_average_power(self, route_id: str, baseline_power_db: float) -> Tuple[float, float]:
        normalized_route_id = self._normalize_route_id(route_id)

        min_variation = min(settings.power_variation_min_db, settings.power_variation_max_db)
        max_variation = max(settings.power_variation_min_db, settings.power_variation_max_db)
        step_db = random.uniform(min_variation, max_variation)

        previous_offset = self.route_power_offsets_db.get(normalized_route_id)
        if previous_offset is None:
            direction = random.choice([-1.0, 1.0])
            new_offset = direction * step_db
            variation_db = step_db
        else:
            direction = random.choice([-1.0, 1.0])
            new_offset = previous_offset + (direction * step_db)

            # Keep long-term drift bounded while preserving 0.1-0.3 dB change between tests.
            if abs(new_offset) > 1.5:
                new_offset = previous_offset - (direction * step_db)

            variation_db = abs(new_offset - previous_offset)

        self.route_power_offsets_db[normalized_route_id] = new_offset
        return baseline_power_db + new_offset, variation_db

    def _inject_fault_event(self, events: List[OTDREvent], fiber_length: float, fault_type: str):
        fault_distance = random.uniform(max(0.2, fiber_length * 0.2), max(0.3, fiber_length * 0.9))
        normalized = (fault_type or "").strip().lower()

        if normalized == "break":
            events.append(
                OTDREvent(
                    type=EventType.BREAK,
                    distance_km=round(fault_distance, 3),
                    loss_db=round(random.uniform(15.0, 25.0), 3),
                )
            )
        elif normalized == "degradation":
            events.append(
                OTDREvent(
                    type=EventType.BEND,
                    distance_km=round(fault_distance, 3),
                    loss_db=round(random.uniform(1.0, 3.0), 3),
                )
            )
        elif normalized == "high_loss_splice":
            events.append(
                OTDREvent(
                    type=EventType.SPLICE,
                    distance_km=round(fault_distance, 3),
                    loss_db=round(random.uniform(0.5, 1.5), 3),
                )
            )

        events.sort(key=lambda event: event.distance_km)

    def _fault_power_penalty(self, fault_type: str) -> float:
        normalized = (fault_type or "").strip().lower()
        if normalized == "break":
            return random.uniform(2.0, 4.0)
        if normalized == "degradation":
            return random.uniform(0.5, 1.2)
        if normalized == "high_loss_splice":
            return random.uniform(0.3, 0.8)
        return 0.0

    def _generate_events(
        self,
        fiber_length: float,
        splice_count: int,
        inject_fault: bool,
        fault_type: str,
    ) -> List[OTDREvent]:
        """Generate synthetic events when no route reference file exists."""
        events: List[OTDREvent] = []

        splice_spacing = fiber_length / (splice_count + 1)
        for index in range(splice_count):
            distance = splice_spacing * (index + 1) + random.uniform(-0.5, 0.5)
            events.append(
                OTDREvent(
                    type=EventType.SPLICE,
                    distance_km=round(max(distance, 0.05), 3),
                    loss_db=round(random.uniform(0.05, 0.15), 3),
                )
            )

        connector_count = random.randint(1, 3)
        for _ in range(connector_count):
            events.append(
                OTDREvent(
                    type=EventType.CONNECTOR,
                    distance_km=round(random.uniform(0.8, max(1.0, fiber_length - 0.8)), 3),
                    loss_db=round(random.uniform(0.2, 0.5), 3),
                )
            )

        if inject_fault:
            self._inject_fault_event(events, fiber_length, fault_type)

        events.sort(key=lambda event: event.distance_km)
        return events

    def _calculate_total_loss(self, fiber_length: float, events: List[OTDREvent]) -> float:
        attenuation_loss = fiber_length * self.attenuation
        event_loss = sum(event.loss_db for event in events)
        total_loss = attenuation_loss + event_loss + random.uniform(-0.1, 0.1)
        return max(0.0, total_loss)

    def _determine_status(self, total_loss: float, events: List[OTDREvent]) -> TraceStatus:
        for event in events:
            if event.type == EventType.BREAK:
                return TraceStatus.BREAK

        if total_loss > settings.alarm_threshold_break:
            return TraceStatus.BREAK
        if total_loss > settings.alarm_threshold_degradation:
            return TraceStatus.DEGRADATION
        return TraceStatus.NORMAL

    @staticmethod
    def _safe_float(value) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _map_event_type(raw_type: str) -> EventType:
        normalized = raw_type.lower()
        if "break" in normalized:
            return EventType.BREAK
        if "reflection" in normalized:
            return EventType.REFLECTION
        if "multiple" in normalized:
            return EventType.CONNECTOR
        if "bend" in normalized:
            return EventType.BEND
        if "loss/drop/gain" in normalized or "splice" in normalized:
            return EventType.SPLICE
        return EventType.SPLICE

    @staticmethod
    def _extract_route_id_from_filename(file_name: str) -> str:
        if file_name.endswith("-dump.json"):
            route_id = file_name[: -len("-dump.json")]
        elif file_name.endswith("-trace.dat"):
            route_id = file_name[: -len("-trace.dat")]
        else:
            route_id = file_name

        return OTDRSimulator._normalize_route_id(route_id)

    @staticmethod
    def _normalize_route_id(route_id: str) -> str:
        return (route_id or "").strip().rstrip("_")

    @classmethod
    def get_route_config(cls, route_id: str) -> dict:
        """Get configuration for a specific route."""
        return cls.ROUTE_CONFIG.get(route_id, {})

    @classmethod
    def get_all_routes(cls) -> List[str]:
        """Get list of all configured routes."""
        return list(cls.ROUTE_CONFIG.keys())
