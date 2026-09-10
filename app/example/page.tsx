import type { Metadata } from 'next';
import ExampleWorkshop from '../components/ExampleWorkshop';
import '../example-workshop.css';

export const metadata: Metadata = {
  title: 'Example workshop — Workshop Prep Agent',
  description: 'Explore a saved 75-minute AI pilot selection workshop, with an agenda, exercise, facilitator notes and fictional source materials.',
};

export default function ExampleWorkshopPage() {
  return <ExampleWorkshop />;
}
