import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { customerSchema, doctorSchema, idParam, partyPaymentSchema, supplierSchema, boolQuery } from '@pharma/shared';
import { findCustomerByPhone, getCustomer, getSupplier, listCustomers, listDoctors, listPayments, listSuppliers, partyLedgerRows, recordPartyPayment, saveCustomer, saveDoctor, saveSupplier } from '../services/parties.js';
import { listSales } from '../services/sales.js';

const q = z.object({ q: z.string().optional(), all: boolQuery, dues: boolQuery });

export const partyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/suppliers', { schema: { querystring: q }, preHandler: app.requireAuth }, async (req) => listSuppliers(app.db, req.query.q, !req.query.all));
  app.post('/suppliers', { schema: { body: supplierSchema }, preHandler: app.requirePermission('party.write') }, async (req) => saveSupplier(app.db, req.ctx!, req.body));
  app.get('/suppliers/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => ({ ...getSupplier(app.db, req.params.id), ledger: partyLedgerRows(app.db, 'supplier', req.params.id), payments: listPayments(app.db, 'supplier', req.params.id) }));
  app.put('/suppliers/:id', { schema: { params: idParam, body: supplierSchema }, preHandler: app.requirePermission('party.write') }, async (req) => saveSupplier(app.db, req.ctx!, req.body, req.params.id));
  app.post('/suppliers/:id/payments', { schema: { params: idParam, body: partyPaymentSchema }, preHandler: app.requirePermission('payment.write') }, async (req) => recordPartyPayment(app.db, req.ctx!, 'supplier', req.params.id, req.body));

  app.get('/customers', { schema: { querystring: q }, preHandler: app.requireAuth }, async (req) => listCustomers(app.db, req.query.q, req.query.dues));
  app.get('/customers/by-phone/:phone', { schema: { params: z.object({ phone: z.string() }) }, preHandler: app.requireAuth }, async (req) => findCustomerByPhone(app.db, req.params.phone));
  app.post('/customers', { schema: { body: customerSchema }, preHandler: app.requirePermission('party.write') }, async (req) => saveCustomer(app.db, req.ctx!, req.body));
  app.get('/customers/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => ({ ...getCustomer(app.db, req.params.id), ledger: partyLedgerRows(app.db, 'customer', req.params.id), payments: listPayments(app.db, 'customer', req.params.id), sales: listSales(app.db, { customerId: req.params.id, page: 1, pageSize: 50 }).rows }));
  app.put('/customers/:id', { schema: { params: idParam, body: customerSchema }, preHandler: app.requirePermission('party.write') }, async (req) => saveCustomer(app.db, req.ctx!, req.body, req.params.id));
  app.post('/customers/:id/payments', { schema: { params: idParam, body: partyPaymentSchema }, preHandler: app.requirePermission('payment.write') }, async (req) => recordPartyPayment(app.db, req.ctx!, 'customer', req.params.id, req.body));

  app.get('/doctors', { schema: { querystring: q }, preHandler: app.requireAuth }, async (req) => listDoctors(app.db, req.query.q));
  app.post('/doctors', { schema: { body: doctorSchema }, preHandler: app.requirePermission('party.write') }, async (req) => saveDoctor(app.db, req.ctx!, req.body));
  app.put('/doctors/:id', { schema: { params: idParam, body: doctorSchema }, preHandler: app.requirePermission('party.write') }, async (req) => saveDoctor(app.db, req.ctx!, req.body, req.params.id));
};
