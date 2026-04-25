import json
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from config import settings
from models import EventType, OTDREvent, OTDRTrace, TraceStatus, RtuHealth


@dataclass
class RouteReferenceBundle:
    event_file: Path
    measurement_file: Path
    events: List[OTDREvent]
    trace_points: List[Tuple[float, float]]
    reference_power_budget_db: float


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
        
        # Temperature tracking for dynamic fluctuation
        self.current_base_temp = round(random.uniform(30.0, 45.0), 1)  # Base temperature 30-45°C
        self.cpu_usage = round(random.uniform(15.0, 35.0), 1)
        self.memory_usage = round(random.uniform(35.0, 55.0), 1)

    def generate_trace(
        self,
        route_id: str,
        inject_fault: bool = False,
        fault_type: str = "normal",
        distance_km: float = None,
        fixed_fault_power_db: float = None,
        fault_power_penalty_db: float = None,
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
            power_budget_db, variation_db = self._next_power_budget(route_id, reference.reference_power_budget_db)

            if inject_fault:
                if fixed_fault_power_db is not None:
                    power_budget_db = fixed_fault_power_db
                else:
                    penalty_db = (
                        fault_power_penalty_db
                        if fault_power_penalty_db is not None
                        else self._fault_power_penalty(fault_type)
                    )
                    power_budget_db += penalty_db
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
                average_power_db=round(power_budget_db, 3),
                power_variation_db=round(variation_db, 3),
                rtu_health=self._generate_rtu_health(),
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
        baseline_power_budget_db = max(0.5, (distance_km * self.attenuation) + (splice_count * 0.08))
        power_budget_db, variation_db = self._next_power_budget(route_id, baseline_power_budget_db)

        if inject_fault:
            if fixed_fault_power_db is not None:
                power_budget_db = fixed_fault_power_db
            else:
                penalty_db = (
                    fault_power_penalty_db
                    if fault_power_penalty_db is not None
                    else self._fault_power_penalty(fault_type)
                )
                power_budget_db += penalty_db
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
            average_power_db=round(power_budget_db, 3),
            power_variation_db=round(variation_db, 3),
            rtu_health=self._generate_rtu_health(),
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

        for pdf_path in self.reference_root.rglob("*.pdf"):
            route_id = self._extract_route_id_from_filename(pdf_path.name)
            if not route_id:
                continue
            entry = index.setdefault(route_id, {})
            entry["pdf"] = pdf_path

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
            reference_power_budget_db = self._extract_reference_power_budget(event_json, trace_points)

            bundle = RouteReferenceBundle(
                event_file=event_file,
                measurement_file=measurement_file,
                events=events,
                trace_points=trace_points,
                reference_power_budget_db=reference_power_budget_db,
            )
            self.reference_cache[normalized_route_id] = bundle
            return bundle
        except Exception:
            return None

    def _extract_reference_power_budget(
        self,
        event_json: dict,
        trace_points: List[Tuple[float, float]],
    ) -> float:
        key_events = event_json.get("KeyEvents") or {}
        summary = key_events.get("Summary") or key_events.get("summary") or event_json.get("Summary") or {}

        candidate_keys = ["total loss", "total_loss", "totalLoss", "totalLossDb"]
        for key in candidate_keys:
            value = self._safe_float(summary.get(key))
            if value is not None:
                return max(0.0, value)

        if trace_points:
            max_distance = max(point[0] for point in trace_points)
            return max(0.0, max_distance * self.attenuation)

        return 0.0

    def get_reference_trace_profile(self, route_id: str, max_points: int = 1200) -> dict:
        normalized_route_id = self._normalize_route_id(route_id)
        reference = self._get_route_reference(normalized_route_id)

        if reference is None:
            return {
                "route_id": normalized_route_id,
                "measurement_reference_file": None,
                "total_points": 0,
                "point_count": 0,
                "distance_range_km": None,
                "points": [],
            }

        sampled_points = self._sample_trace_points(reference.trace_points, max_points)
        points_payload = [
            {
                "distance_km": round(distance_km, 6),
                "power_db": round(power_db, 6),
            }
            for distance_km, power_db in sampled_points
        ]

        if reference.trace_points:
            min_distance = min(point[0] for point in reference.trace_points)
            max_distance = max(point[0] for point in reference.trace_points)
            distance_range_km = {
                "min": round(min_distance, 6),
                "max": round(max_distance, 6),
            }
        else:
            distance_range_km = None

        return {
            "route_id": normalized_route_id,
            "measurement_reference_file": reference.measurement_file.name,
            "total_points": len(reference.trace_points),
            "point_count": len(points_payload),
            "distance_range_km": distance_range_km,
            "points": points_payload,
        }

    def get_reference_pdf_file(self, route_id: str) -> Optional[Path]:
        normalized_route_id = self._normalize_route_id(route_id)
        file_entry = self.reference_index.get(normalized_route_id)
        if not file_entry:
            return None

        pdf_file = file_entry.get("pdf")
        if not pdf_file or not pdf_file.exists() or not pdf_file.is_file():
            return None

        return pdf_file

    @staticmethod
    def _sample_trace_points(trace_points: List[Tuple[float, float]], max_points: int) -> List[Tuple[float, float]]:
        if not trace_points:
            return []

        safe_limit = max(2, int(max_points))
        if len(trace_points) <= safe_limit:
            return trace_points

        last_index = len(trace_points) - 1
        step = last_index / float(safe_limit - 1)
        sampled_indices = sorted({int(round(index * step)) for index in range(safe_limit)} | {0, last_index})

        return [trace_points[index] for index in sampled_indices]

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

    def _next_power_budget(self, route_id: str, baseline_power_budget_db: float) -> Tuple[float, float]:
        min_variation = min(settings.power_variation_min_db, settings.power_variation_max_db)
        max_variation = max(settings.power_variation_min_db, settings.power_variation_max_db)

        # Keep each test referenced to the route baseline (no cumulative drift).
        variation_db = random.uniform(min_variation, max_variation)
        direction = random.choice([-1.0, 1.0])
        current_offset_db = direction * variation_db

        return max(0.0, baseline_power_budget_db + current_offset_db), variation_db

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
            return 5.0
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
        lower_name = file_name.lower()

        if lower_name.endswith("-dump.json"):
            route_id = file_name[: -len("-dump.json")]
        elif lower_name.endswith("-trace.dat"):
            route_id = file_name[: -len("-trace.dat")]
        elif lower_name.endswith(".pdf"):
            route_id = file_name[: -len(".pdf")]
        else:
            route_id = file_name

        return OTDRSimulator._normalize_route_id(route_id)

    @staticmethod
    def _normalize_route_id(route_id: str) -> str:
        return (route_id or "").strip().rstrip("_")

    def _generate_rtu_health(self) -> RtuHealth:
        """Generate RTU health metrics with realistic fluctuations."""
        # Temperature fluctuation: ±2-3°C from base temperature
        temp_fluctuation = random.uniform(-3.0, 2.5)
        current_temp = round(self.current_base_temp + temp_fluctuation, 1)
        
        # Keep temperature within normal operating range (25-60°C)
        current_temp = max(25.0, min(60.0, current_temp))
        
        # Update base temperature for next test (gradual drift)
        self.current_base_temp = round(current_temp + random.uniform(-0.5, 0.5), 1)
        
        # CPU and Memory usage fluctuation
        cpu_fluctuation = random.uniform(-2.0, 2.5)
        self.cpu_usage = round(max(10.0, min(80.0, self.cpu_usage + cpu_fluctuation)), 1)
        
        mem_fluctuation = random.uniform(-2.0, 2.5)
        self.memory_usage = round(max(20.0, min(90.0, self.memory_usage + mem_fluctuation)), 1)
        
        # Power supply status (mostly normal, rarely degraded)
        power_status = "DEGRADED" if random.random() < 0.05 else "NORMAL"
        
        return RtuHealth(
            temperature_c=current_temp,
            cpu_usage_percent=self.cpu_usage,
            memory_usage_percent=self.memory_usage,
            power_supply_status=power_status
        )

    @classmethod
    def get_route_config(cls, route_id: str) -> dict:
        """Get configuration for a specific route."""
        return cls.ROUTE_CONFIG.get(route_id, {})

    @classmethod
    def get_all_routes(cls) -> List[str]:
        """Get list of all configured routes."""
        return list(cls.ROUTE_CONFIG.keys())
