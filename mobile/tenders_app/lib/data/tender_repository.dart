import '../models/tender.dart';
import 'demo_tenders.dart';

/// Source des avis. L'app ne dépend que de cette interface : brancher un vrai serveur
/// (qui collecte les avis du portail des marchés publics) revient à en écrire une
/// autre implémentation.
abstract class TenderRepository {
  Future<List<Tender>> fetchAll();
}

class DemoTenderRepository implements TenderRepository {
  @override
  Future<List<Tender>> fetchAll() async => demoTenders();
}
