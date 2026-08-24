import type { FlightOption } from "@yuanfen/shared";

/**
 * One stable JSON envelope, mirroring the atlas-flight CLI contract:
 * read schema_version/status/code/message/retryable/request_id/data/details,
 * branch on `code`, treat every ID as opaque.
 */
export interface Envelope<T = unknown> {
  schema_version: string;
  status: "ok" | "error";
  code: string;
  message: string;
  retryable: boolean;
  request_id: string;
  data: T | null;
  details: unknown;
}

export interface SearchParams {
  origin: string;
  destination: string;
  depart: string;
  adults: number;
}

export interface SearchData {
  search_id: string;
  currency: string;
  offers: FlightOption[];
}

export interface VerifyData {
  booking_id: string;
  offer: FlightOption;
  price_status: "current" | "reference";
  verified_base: number;
  verified_total_with_bag: number;
  price_changed: boolean;
  previous_total_with_bag?: number;
}

export interface PassengerInput {
  full_name: string;
  gender: string;
  date_of_birth: string;
  nationality: string;
  document_type: string;
  document_number: string;
  issuing_country: string;
  expiry_date: string;
  contact_name: string;
}

export interface OrderData {
  order_no: string;
  payment_confirmation_id: string;
  summary: {
    flight_no: string;
    route: string;
    depart: string;
    passenger_masked: string;
    total: number;
    currency: string;
    payment_deadline: string;
  };
}

export interface PayData {
  order_no: string;
  payment_status: "paid";
}

export interface StatusData {
  order_no: string;
  pnr: string;
  ticket_numbers: string[];
  ticketing_status: "ticketed" | "pending";
}

export type AtlasMode = "fixture" | "cli";

export interface AtlasClient {
  readonly mode: AtlasMode;
  readonly environment: string;
  search(params: SearchParams): Promise<Envelope<SearchData>>;
  offerVerify(offerId: string): Promise<Envelope<VerifyData>>;
  orderCreate(bookingId: string, passengers: PassengerInput[]): Promise<Envelope<OrderData>>;
  orderPay(confirmationId: string): Promise<Envelope<PayData>>;
  orderStatus(orderNo: string): Promise<Envelope<StatusData>>;
}
