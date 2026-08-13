// The skeuomorphic top-down visualisation: a rounded-rect body, windshield,
// headlights and brake-reacting taillights per car. Reads the same
// RoadState and the same coordinate mapping as waveView.ts (see
// viewShared.ts) — this is a second renderer for one shared simulation, not
// a second simulation.
import { PARAMS } from "./traffic";
import type { RoadState } from "./traffic";
import { LANE_HEIGHT, LANE_Y, PX_PER_UNIT, speedState } from "./viewShared";

const SVG_NS = "http://www.w3.org/2000/svg";
const VEHICLE_LENGTH = 26; // px along the direction of travel
const VEHICLE_WIDTH = 18; // px across the lane

export interface RealRoadView {
  rebuildVehicles(carsPerLane: number): void;
  render(road: RoadState): void;
}

function lightCircle(cx: number, cy: number, cls: string): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("class", cls);
  c.setAttribute("cx", String(cx));
  c.setAttribute("cy", String(cy));
  c.setAttribute("r", "1.6");
  return c;
}

// Every car travels in the +x direction (see traffic.ts), so "front" and
// "rear" are the same side for every lane — headlights always lead,
// taillights always trail.
function buildVehicle(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "vehicle");

  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("class", "vehicle-body");
  body.setAttribute("x", String(-VEHICLE_LENGTH / 2));
  body.setAttribute("y", String(-VEHICLE_WIDTH / 2));
  body.setAttribute("width", String(VEHICLE_LENGTH));
  body.setAttribute("height", String(VEHICLE_WIDTH));
  body.setAttribute("rx", "4");

  const windshield = document.createElementNS(SVG_NS, "rect");
  windshield.setAttribute("class", "vehicle-windshield");
  windshield.setAttribute("x", "-3");
  windshield.setAttribute("y", String(-VEHICLE_WIDTH / 2 + 2));
  windshield.setAttribute("width", "8");
  windshield.setAttribute("height", String(VEHICLE_WIDTH - 4));

  const front = VEHICLE_LENGTH / 2 - 2;
  const rear = -front;
  const lightOffset = VEHICLE_WIDTH / 2 - 3;

  g.append(
    body,
    windshield,
    lightCircle(front, -lightOffset, "vehicle-headlight"),
    lightCircle(front, lightOffset, "vehicle-headlight"),
    lightCircle(rear, -lightOffset, "vehicle-taillight"),
    lightCircle(rear, lightOffset, "vehicle-taillight"),
  );
  return g;
}

export function createRealRoadView(root: ParentNode): RealRoadView {
  const vehiclesGroup = root.querySelector<SVGGElement>("#road-vehicles")!;
  let vehicleElements: SVGGElement[][] = [];

  function rebuildVehicles(carsPerLane: number): void {
    vehiclesGroup.replaceChildren();
    vehicleElements = Array.from({ length: PARAMS.laneCount }, () =>
      Array.from({ length: carsPerLane }, () => {
        const g = buildVehicle();
        vehiclesGroup.appendChild(g);
        return g;
      }),
    );
  }

  function render(road: RoadState): void {
    road.lanes.forEach((lane, laneIndex) => {
      lane.cars.forEach((car, carIndex) => {
        const g = vehicleElements[laneIndex][carIndex];
        const x = car.position * PX_PER_UNIT;
        const y = LANE_Y[laneIndex] + LANE_HEIGHT / 2;
        g.setAttribute("transform", `translate(${x.toFixed(1)}, ${y})`);
        g.dataset.state = speedState(car.speed / PARAMS.desiredSpeed);
        g.classList.toggle("braking", car.brakeFlash > 0);
      });
    });
  }

  return { rebuildVehicles, render };
}
